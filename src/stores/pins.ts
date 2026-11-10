import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Album, Playlist } from '@/core/models';
import { appStore } from '@/services/appStorage';

interface PinsState {
  albums: Album[];
  playlists: Playlist[];
  favourites: boolean;
  toggleAlbum: (album: Album) => void;
  togglePlaylist: (playlist: Playlist) => void;
  toggleFavourites: () => void;
}

const storage = createJSONStorage(() => ({
  getItem: (name) => appStore.get(name),
  setItem: (name, value) => appStore.set(name, value),
  removeItem: (name) => appStore.remove(name),
}));

export const usePinsStore = create<PinsState>()(
  persist(
    (set) => ({
      albums: [],
      playlists: [],
      favourites: false,
      toggleAlbum: (album) =>
        set((state) => ({
          albums: state.albums.some((item) => item.id === album.id)
            ? state.albums.filter((item) => item.id !== album.id)
            : [{ ...album, songs: undefined }, ...state.albums],
        })),
      togglePlaylist: (playlist) =>
        set((state) => ({
          playlists: state.playlists.some((item) => item.id === playlist.id)
            ? state.playlists.filter((item) => item.id !== playlist.id)
            : [{ ...playlist, songs: undefined }, ...state.playlists],
        })),
      toggleFavourites: () => set((state) => ({ favourites: !state.favourites })),
    }),
    { name: 'laila.pins', storage },
  ),
);
