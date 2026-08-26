export const MAX_FAVORITE_PROJECTS = 10;

export type FavoriteProjectRecord = {
  project_id: number;
  favorited_at: string;
};

export function favoriteProjectsStorageKey(userScope: string) {
  return `gongmu-favorite-projects:${userScope}`;
}

export function addFavoriteToList<T extends FavoriteProjectRecord>(
  favorites: T[],
  favorite: T
) {
  const existing = favorites.find(
    (item) => item.project_id === favorite.project_id
  );

  return [
    existing ? { ...favorite, favorited_at: existing.favorited_at } : favorite,
    ...favorites.filter((item) => item.project_id !== favorite.project_id),
  ].slice(0, MAX_FAVORITE_PROJECTS);
}

export function removeFavoriteFromList<T extends FavoriteProjectRecord>(
  favorites: T[],
  projectId: number
) {
  return favorites.filter((favorite) => favorite.project_id !== projectId);
}

export function resolveFavoriteHydration<T>(
  databaseFavorites: T[] | null,
  localFavorites: T[]
) {
  return databaseFavorites?.length ? databaseFavorites : localFavorites;
}
