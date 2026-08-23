// 내가 쓴 글/댓글 수집 (마이페이지, v1.9) — 게시판 글·댓글 / 로드뷰 그림·댓글 / 방명록
import { Post, GuestEntry } from './postStore';
import { RoadItem } from './galleryStore';
import { Board, MAIN_BOARD_ID } from './boardStore';

export interface MyItem { kind: string; text: string; date: string; href: string }

export function collectMyItems(
  userId: string,
  posts: Post[], roads: RoadItem[], guestEntries: GuestEntry[], boards: Board[],
): MyItem[] {
  const boardName = (p: Post) => {
    const b = boards.find(x => x.id === (p.boardId ?? MAIN_BOARD_ID));
    return b && b.id !== MAIN_BOARD_ID ? b.name : '게시판';
  };
  return [
    ...posts.filter(p => p.authorId === userId)
      .map(p => ({ kind: `${boardName(p)} 글`, text: p.title, date: p.date, href: `/board/${p.id}` })),
    ...posts.flatMap(p => p.comments.filter(c => c.authorId === userId)
      .map(c => ({ kind: `${boardName(p)} 댓글`, text: c.text, date: c.date, href: `/board/${p.id}` }))),
    ...roads.filter(it => it.authorId === userId)
      .map(it => ({ kind: '로드비 그림', text: it.title, date: it.date, href: '/roadview' })),
    ...roads.flatMap(it => it.comments.filter(c => c.authorId === userId)
      .map(c => ({ kind: '로드비 댓글', text: c.text, date: c.date, href: '/roadview' }))),
    ...guestEntries.filter(e => e.authorId === userId)
      .map(e => ({ kind: '방명록', text: e.body, date: e.date, href: '/guest' })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}
