import assert from "node:assert/strict";
import test from "node:test";

import {
  addFavoriteToList,
  favoriteProjectsStorageKey,
  removeFavoriteFromList,
  resolveFavoriteHydration,
} from "./favorite-projects.ts";

type Favorite = {
  project_id: number;
  project_name: string;
  favorited_at: string;
};

const first: Favorite = {
  project_id: 1,
  project_name: "첫 프로젝트",
  favorited_at: "2026-08-25T01:00:00.000Z",
};

test("favorite를 추가하고 같은 project_id 중복을 방지한다", () => {
  const added = addFavoriteToList([], first);
  const duplicated = addFavoriteToList(added, {
    ...first,
    project_name: "변경된 프로젝트명",
    favorited_at: "2026-08-25T02:00:00.000Z",
  });

  assert.equal(duplicated.length, 1);
  assert.equal(duplicated[0].project_name, "변경된 프로젝트명");
  assert.equal(duplicated[0].favorited_at, first.favorited_at);
});

test("favorite를 project_id 기준으로 삭제한다", () => {
  assert.deepEqual(removeFavoriteFromList([first], first.project_id), []);
});

test("사용자별 localStorage key를 분리한다", () => {
  assert.notEqual(
    favoriteProjectsStorageKey("auth-user-a"),
    favoriteProjectsStorageKey("auth-user-b")
  );
});

test("DB 실패 또는 신규 빈 서버 목록에서 기존 localStorage favorite를 보존한다", () => {
  assert.deepEqual(resolveFavoriteHydration(null, [first]), [first]);
  assert.deepEqual(resolveFavoriteHydration([], [first]), [first]);
  assert.deepEqual(resolveFavoriteHydration([first], []), [first]);
});
