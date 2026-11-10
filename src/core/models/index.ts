export type AuthMode = 'apiKey' | 'token';

export interface ServerConfig {
  /** Base URL without a trailing slash, e.g. https://music.example.com */
  url: string;
  /** Human label, e.g. "Home WiFi" or "Cellular". */
  name?: string;
  /** SSID this instance is bound to, or __cellular__. */
  network?: string;
  username: string;
  authMode: AuthMode;
  apiKey?: string;
  /** Kept in memory only; never persisted. */
  password?: string;
  /** Optional, only when the user opted into remembering a token session. */
  token?: string;
  salt?: string;
  /** Extra headers for reverse proxies (Cloudflare Access, Authelia, ...). */
  headers?: Record<string, string>;
}

export interface Track {
  id: string;
  title: string;
  artist?: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  coverArt?: string;
  duration?: number;
  track?: number;
  discNumber?: number;
  year?: number;
  genre?: string;
  bitRate?: number;
  suffix?: string;
  contentType?: string;
  size?: number;
  starred?: string;
}

export interface Album {
  id: string;
  name: string;
  artist?: string;
  artistId?: string;
  coverArt?: string;
  songCount?: number;
  duration?: number;
  year?: number;
  genre?: string;
  starred?: string;
  songs?: Track[];
}

export interface Artist {
  id: string;
  name: string;
  coverArt?: string;
  albumCount?: number;
  starred?: string;
  albums?: Album[];
}

export interface Playlist {
  id: string;
  name: string;
  comment?: string;
  owner?: string;
  songCount?: number;
  duration?: number;
  coverArt?: string;
  songs?: Track[];
}

export interface Genre {
  name: string;
  songCount?: number;
  albumCount?: number;
}

export type AlbumListType =
  | 'newest'
  | 'recent'
  | 'frequent'
  | 'random'
  | 'alphabeticalByName'
  | 'alphabeticalByArtist'
  | 'starred'
  | 'highest';

export interface SearchResult {
  artists: Artist[];
  albums: Album[];
  songs: Track[];
}

export interface NowPlayingEntry {
  track: Track;
  username?: string;
  playerName?: string;
  playerId?: number;
  minutesAgo?: number;
}

export interface SubsonicErrorInfo {
  code: number;
  message?: string;
  helpUrl?: string;
}
