'use client';
// 이미지/파일 저장 (v2.0)
//  · 서버 모드: Supabase Storage 버킷(ohome)에 올리고, 저장하는 값은 공개 URL
//  · 로컬 모드: IndexedDB (파일 id만 데이터에 저장)
// 화면 코드는 항상 "참조 문자열"만 다루므로 두 모드가 같은 코드로 동작한다.
import React, { useEffect, useState } from 'react';
import { newId } from './postStore';
import { backend, isServerMode } from './backend';

const DB_NAME = 'ohome-blobs';
const STORE = 'files';

/** 확장자 추론 — Storage에 올릴 때 파일 이름에 쓴다 */
function extOf(blob: Blob): string {
  const t = blob.type || '';
  if (t.includes('png')) return 'png';
  if (t.includes('gif')) return 'gif';
  if (t.includes('webp')) return 'webp';
  if (t.includes('svg')) return 'svg';
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  if (t.includes('font') || t.includes('woff')) return 'woff2';
  if (t.startsWith('text/')) return 'txt';
  return 'bin';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Blob 저장 → 참조 문자열 반환 (서버 모드: 공개 URL · 로컬 모드: 파일 id) */
export async function putBlob(blob: Blob): Promise<string> {
  const be = isServerMode() ? backend() : null;
  if (be) return be.uploadFile(blob, extOf(blob));   // 서버 모드 — 공개 URL 반환
  const id = newId();
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return id;
}

/** 전체 파일 목록 (id → Blob) — 데이터 백업 내보내기용 (5.2) */
export async function allBlobs(): Promise<Map<string, Blob>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const out = new Map<string, Blob>();
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) { resolve(out); return; }
      out.set(String(cur.key), cur.value as Blob);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/** 지정 id로 Blob 저장 — 백업 복원용 (기존 id 유지) */
export async function putBlobAs(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBlob(id: string): Promise<Blob | null> {
  // 서버 모드에서 저장된 값은 공개 URL — 그대로 받아 온다 (백업 zip 내보내기 등에서 사용)
  if (/^https?:/.test(id)) {
    try {
      const res = await fetch(id);
      return res.ok ? await res.blob() : null;
    } catch { return null; }
  }
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/* 세션 내 objectURL 캐시 (id → url) */
const urlCache = new Map<string, string>();

/**
 * 파일 참조 → 표시 가능한 URL.
 * - http(s)/data: 는 그대로
 * - blob: 은 새로고침 후 죽은 참조 → undefined (플레이스홀더 폴백)
 * - 그 외는 IndexedDB 파일 id로 간주해 로드
 */
export function useBlobUrl(ref?: string): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => {
    if (!ref) return undefined;
    if (/^(https?:|data:)/.test(ref)) return ref;
    if (ref.startsWith('blob:')) return undefined;
    return urlCache.get(ref);
  });

  useEffect(() => {
    if (!ref) { setUrl(undefined); return; }
    if (/^(https?:|data:)/.test(ref)) { setUrl(ref); return; }
    if (ref.startsWith('blob:')) { setUrl(undefined); return; }
    if (urlCache.has(ref)) { setUrl(urlCache.get(ref)); return; }
    let alive = true;
    getBlob(ref).then(b => {
      if (b && alive) {
        const u = URL.createObjectURL(b);
        urlCache.set(ref, u);
        setUrl(u);
      }
    }).catch(() => { /* 없으면 플레이스홀더 */ });
    return () => { alive = false; };
  }, [ref]);

  return url;
}

/** 파일 참조 이미지 — 없으면 플레이스홀더(ph) 폴백 */
export function BlobImg({ fileRef, ph, alt, style, imgStyle, label }: {
  fileRef?: string; ph?: string; alt?: string;
  style?: React.CSSProperties; imgStyle?: React.CSSProperties; label?: string;
}) {
  const url = useBlobUrl(fileRef);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover', ...imgStyle }} />;
  }
  return <div className={`ph ${ph ?? ''}`} style={{ width: '100%', height: '100%', ...style }}>{label && <span>{label}</span>}</div>;
}
