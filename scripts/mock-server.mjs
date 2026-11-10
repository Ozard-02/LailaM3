#!/usr/bin/env node
/**
 * Tiny Navidrome/Subsonic mock for local development and E2E.
 * It is not a product feature and it never talks to a real server.
 *
 *   node scripts/mock-server.mjs
 *   # then sign in with http://localhost:4545, any username, password "laila"
 */
import { Buffer } from 'node:buffer';
import http from 'node:http';
import { URL } from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.MOCK_PORT ?? 4545);
const USERNAME = 'laila';
// Raise this to exercise large-library pagination and profiling (e.g. 1200).
const ALBUM_COUNT = Math.max(16, Number(process.env.MOCK_ALBUMS ?? 16) || 16);
// Mock accepts any password/token; these are not real credentials.
const HOST = process.env.MOCK_HOST ?? '127.0.0.1';

const ALBUM_NAMES = [
  'A Quiet Place',
  'Blue Hour',
  'Cassette Dreams',
  'Dawn Chorus',
  'Evening Light',
  'Folded Letters',
  'Glass Garden',
  'Hidden Tracks',
  'Inner Weather',
  'Late Night Radio',
  'Paper Moon',
  'Soft Focus',
  '周杰伦精选',
];
const ARTIST_NAMES = [
  'Aria North',
  'Blue Harbor',
  'Cassette Club',
  'Dawn Chorus',
  'Evening Light',
  'Folded Lines',
];

function album(id) {
  const index = Number(id.replace(/\D/g, '')) || 0;
  const base = ALBUM_NAMES[index % ALBUM_NAMES.length] ?? ALBUM_NAMES[0];
  const name = index >= ALBUM_NAMES.length ? `${base} ${Math.floor(index / ALBUM_NAMES.length) + 1}` : base;
  const artist = ARTIST_NAMES[index % ARTIST_NAMES.length] ?? ARTIST_NAMES[0];
  return {
    id: `al-${index}`,
    name,
    artist,
    artistId: `ar-${index % ARTIST_NAMES.length}`,
    coverArt: `cover-${index}`,
    songCount: 4,
    duration: 4 * 63,
    year: 2020 + (index % 6),
    genre: ['Ambient', 'Indie', 'Jazz', 'Electronic'][index % 4],
  };
}

function song(albumId, n) {
  const base = album(albumId);
  return {
    id: `song-${base.id}-${n}`,
    title: ['First Light', 'Slow Motion', 'Paper Planes', 'Night Drive'][n % 4],
    artist: base.artist,
    artistId: base.artistId,
    album: base.name,
    albumId: base.id,
    coverArt: base.coverArt,
    duration: 63,
    track: n + 1,
    suffix: 'wav',
    contentType: 'audio/wav',
    bitRate: 1411,
  };
}

function albumWithSongs(id) {
  const base = album(id);
  return {
    ...base,
    song: [0, 1, 2, 3].map((n) => song(id, n)),
  };
}

const playlistComments = new Map();

function wavBuffer(seconds = 8, frequency = 220) {
  const sampleRate = 8000;
  const samples = seconds * sampleRate;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i += 1) {
    const value = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.12;
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  return buffer;
}

const WAV = wavBuffer();

function svgCover(id) {
  const index = Number(id.replace(/\D/g, '')) || 0;
  const palettes = [
    ['#5B3A6E', '#C76B98', '#F3D9C6'],
    ['#0F3D3E', '#4C9A8A', '#D9E8D4'],
    ['#2E1F27', '#C15C3D', '#F0C987'],
    ['#172A3A', '#4F86C6', '#DCE6F2'],
    ['#3A2E39', '#D4A373', '#FAEDCD'],
    ['#1B1B3A', '#6D5D9B', '#F0E6FF'],
  ];
  const [a, b, c] = palettes[index % palettes.length];
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/>
      <stop offset="0.55" stop-color="${b}"/>
      <stop offset="1" stop-color="${c}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <circle cx="450" cy="120" r="180" fill="${c}" opacity="0.18"/>
  <circle cx="120" cy="500" r="220" fill="${a}" opacity="0.35"/>
  <text x="48" y="520" fill="${c}" font-family="Helvetica, Arial" font-size="42" font-weight="700">LAILA</text>
  <text x="48" y="560" fill="${c}" opacity="0.7" font-family="Helvetica, Arial" font-size="20">${id}</text>
</svg>`;
}

function json(response, body) {
  const payload = JSON.stringify({ 'subsonic-response': { status: 'ok', version: '1.16.1', ...body } });
  response.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Cache-Control': 'no-store',
  });
  response.end(payload);
}

function fail(response, code, message) {
  response.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  response.end(
    JSON.stringify({
      'subsonic-response': {
        status: 'failed',
        version: '1.16.1',
        error: { code, message },
      },
    }),
  );
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? HOST}`);
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    response.end();
    return;
  }

  const path = url.pathname;
  if (path === '/') {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('Laila mock server. Point the app at http://localhost:4545');
    return;
  }

  if (path === '/connect/v1/info') {
    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    response.end(JSON.stringify({ protocol: 'segue', versions: [1], name: 'Laila mock hub' }));
    return;
  }

  if (path.startsWith('/rest/')) {
    const endpoint = path.replace('/rest/', '').replace('.view', '');
    const apiKey = url.searchParams.get('apiKey');
    const token = url.searchParams.get('t');
    const user = url.searchParams.get('u');
    const authorised = Boolean(apiKey) || (user === USERNAME && Boolean(token));
    if (!authorised && endpoint !== 'ping') {
      fail(response, 40, 'Wrong username or password');
      return;
    }

    switch (endpoint) {
      case 'ping':
        if (authorised) json(response, {});
        else fail(response, 40, 'Wrong username or password');
        return;
      case 'getOpenSubsonicExtensions':
        json(response, { openSubsonicExtensions: [{ name: 'apiKeyAuthentication', versions: [1] }] });
        return;
      case 'getAlbumList2': {
        const size = Math.min(Number(url.searchParams.get('size') ?? 20), 500);
        const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0));
        const count = Math.max(0, Math.min(size, ALBUM_COUNT - offset));
        const albums = Array.from({ length: count }, (_, i) => album(String(offset + i)));
        json(response, { albumList2: { album: albums } });
        return;
      }
      case 'getSong': {
        const id = url.searchParams.get('id') ?? 'song-al-0-0';
        const match = /^song-(al-\d+)-(\d+)$/.exec(id);
        json(response, {
          song: match ? song(match[1], Number(match[2])) : song('al-0', 0),
        });
        return;
      }
      case 'getAlbum': {
        const id = url.searchParams.get('id') ?? 'al-0';
        json(response, { album: albumWithSongs(id) });
        return;
      }
      case 'getArtists': {
        const artists = ARTIST_NAMES.map((name, index) => ({
          id: `ar-${index}`,
          name,
          coverArt: `cover-${index}`,
          albumCount: 2,
        }));
        json(response, { artists: { index: [{ name: 'A', artist: artists }] } });
        return;
      }
      case 'getArtist': {
        const id = url.searchParams.get('id') ?? 'ar-0';
        const index = Number(id.replace(/\D/g, '')) || 0;
        json(response, {
          artist: {
            id,
            name: ARTIST_NAMES[index % ARTIST_NAMES.length],
            coverArt: `cover-${index}`,
            albumCount: 2,
            album: [album(String(index)), album(String(index + 3))],
          },
        });
        return;
      }
      case 'getStarred2':
        json(response, {
          starred2: {
            song: [song('al-0', 0), song('al-1', 2)],
            album: [album('al-0'), album('al-1')],
            artist: [{ id: 'ar-0', name: ARTIST_NAMES[0], coverArt: 'cover-0' }],
          },
        });
        return;
      case 'getPlaylists':
        json(response, {
          playlists: {
            playlist: [
              { id: 'pl-1', name: 'Evening', songCount: 4, duration: 252, coverArt: 'cover-0', owner: 'laila', comment: playlistComments.get('pl-1') },
              { id: 'pl-2', name: 'Focus', songCount: 4, duration: 252, coverArt: 'cover-1', owner: 'laila', comment: playlistComments.get('pl-2') },
              { id: 'pl-3', name: 'Sunday', songCount: 4, duration: 252, coverArt: 'cover-2', owner: 'laila', comment: playlistComments.get('pl-3') },
              { id: 'pl-exclusive', name: 'Exclusive', songCount: 1, duration: 63, coverArt: 'cover-3', owner: 'laila', comment: playlistComments.get('pl-exclusive') ?? '#laila-exclusive' },
            ],
          },
        });
        return;
      case 'getPlaylist': {
        const id = url.searchParams.get('id') ?? 'pl-1';
        if (id === 'pl-exclusive') {
          json(response, {
            playlist: {
              id,
              name: 'Exclusive',
              songCount: 1,
              duration: 63,
              coverArt: 'cover-3',
              owner: 'laila',
              comment: playlistComments.get(id) ?? '#laila-exclusive',
              entry: [song('al-3', 0)],
            },
          });
          return;
        }
        json(response, {
          playlist: {
            id,
            name: id === 'pl-2' ? 'Focus' : id === 'pl-3' ? 'Sunday' : 'Evening',
            songCount: 4,
            duration: 252,
            coverArt: 'cover-0',
            owner: 'laila',
            comment: playlistComments.get(id),
            entry: [0, 1, 2, 3].map((n) => song('al-0', n)),
          },
        });
        return;
      }
      case 'updatePlaylist': {
        const playlistId = url.searchParams.get('playlistId');
        const comment = url.searchParams.get('comment');
        if (playlistId && comment !== null) playlistComments.set(playlistId, comment);
        json(response, {});
        return;
      }
      case 'getGenres':
        json(response, {
          genres: {
            genre: [
              { value: 'Ambient', songCount: 12, albumCount: 3 },
              { value: 'Indie', songCount: 8, albumCount: 2 },
              { value: 'Jazz', songCount: 6, albumCount: 2 },
              { value: 'Electronic', songCount: 10, albumCount: 3 },
            ],
          },
        });
        return;
      case 'getSongsByGenre': {
        json(response, { songsByGenre: { song: [0, 1, 2, 3, 4].map((n) => song(`al-${n}`, n)) } });
        return;
      }
      case 'search3': {
        const query = (url.searchParams.get('query') ?? '').toLowerCase();
        const albums = [0, 1, 2, 3, 4, 5]
          .map((i) => album(String(i)))
          .filter((item) => item.name.toLowerCase().includes(query) || item.artist.toLowerCase().includes(query));
        const songs = albums.flatMap((item) => [0, 1].map((n) => song(item.id, n)));
        const artists = ARTIST_NAMES.map((name, index) => ({ id: `ar-${index}`, name, coverArt: `cover-${index}` })).filter(
          (artist) => artist.name.toLowerCase().includes(query),
        );
        json(response, { searchResult3: { artist: artists, album: albums, song: songs } });
        return;
      }
      case 'getRandomSongs':
        json(response, {
          randomSongs: {
            song: [
              song('al-0', 0),
              song('al-1', 0),
              song('al-2', 0),
              song('al-3', 0),
              song('al-4', 0),
            ],
          },
        });
        return;
      case 'getNowPlaying':
        json(response, { nowPlaying: { entry: [] } });
        return;
      case 'getCoverArt': {
        const id = url.searchParams.get('id') ?? 'cover-0';
        response.writeHead(200, {
          'Content-Type': 'image/svg+xml',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
        });
        response.end(svgCover(id));
        return;
      }
      case 'stream':
      case 'download': {
        const range = request.headers.range;
        const total = WAV.length;
        if (range) {
          const match = /bytes=(\d+)-(\d*)/.exec(range);
          const start = Number(match?.[1] ?? 0);
          const end = match?.[2] ? Number(match[2]) : total - 1;
          response.writeHead(206, {
            'Content-Type': 'audio/wav',
            'Accept-Ranges': 'bytes',
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Content-Length': end - start + 1,
            'Access-Control-Allow-Origin': '*',
          });
          response.end(WAV.subarray(start, end + 1));
        } else {
          response.writeHead(200, {
            'Content-Type': 'audio/wav',
            'Accept-Ranges': 'bytes',
            'Content-Length': total,
            'Access-Control-Allow-Origin': '*',
          });
          response.end(WAV);
        }
        return;
      }
      case 'scrobble':
      case 'star':
      case 'unstar':
      case 'savePlayQueue':
        json(response, {});
        return;
      case 'getPlayQueue':
        json(response, { playQueue: { entry: [], current: '', position: 0 } });
        return;
      case 'getLyricsBySongId':
        json(response, {
          lyricsList: {
            structuredLyrics: [
              {
                synced: true,
                line: Array.from({ length: 8 }, (_, index) => ({
                  start: index * 1000,
                  value: `Lyric line ${index + 1}`,
                })),
              },
            ],
          },
        });
        return;
      default:
        fail(response, 0, `Mock does not implement ${endpoint}`);
        return;
    }
  }

  response.writeHead(404, {
    'Content-Type': 'text/plain',
    'Access-Control-Allow-Origin': '*',
  });
  response.end('Not found');
});

// --- Minimal Segue hub for local development -------------------------------
const wss = new WebSocketServer({ noServer: true });
const tvQueue = [
  {
    id: 'song-al-1-0',
    title: 'First Light',
    artist: 'Blue Harbor',
    album: 'Blue Hour',
    durationMs: 63000,
  },
  {
    id: 'song-al-1-1',
    title: 'Slow Motion',
    artist: 'Blue Harbor',
    album: 'Blue Hour',
    durationMs: 63000,
  },
];
const tvDevice = {
  id: 'mock-tv',
  name: 'Living room TV',
  client: 'Laila TV',
  version: '0.1.0',
  api: 'subsonic',
  roles: ['player'],
  capabilities: ['play', 'pause', 'toggle', 'stop', 'previous', 'next', 'setQueue', 'setVolume'],
  online: true,
  state: {
    status: 'paused',
    positionMs: 2000,
    index: 0,
    volume: 70,
    repeat: 'off',
    shuffle: true,
    order: [0, 1],
    queue: tvQueue,
  },
};

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? HOST}`);
  if (url.pathname !== '/connect/v1/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
});

wss.on('connection', (ws) => {
  let deviceId = 'unknown';
  let helloTimer = setTimeout(() => ws.close(4002, 'No hello'), 10_000);

  const send = (message) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(message));
  };

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      send({ type: 'error', error: 'badMessage' });
      return;
    }

    if (message.type === 'hello') {
      clearTimeout(helloTimer);
      deviceId = message.device?.id ?? 'unknown';
      // Each fresh app connection gets the same TV fixture, not the state left
      // by the previous E2E test.
      tvDevice.online = true;
      tvDevice.state = {
        status: 'paused',
        positionMs: 2000,
        index: 0,
        volume: 70,
        repeat: 'off',
        shuffle: true,
        order: [0, 1],
        queue: tvQueue,
      };
      send({
        type: 'welcome',
        protocol: 1,
        user: 'laila',
        serverTime: Date.now(),
        devices: [tvDevice],
        lastPlayback: {
          deviceId: tvDevice.id,
          deviceName: tvDevice.name,
          // The TV fixture is paused on its own card, but the last playback
          // event is "playing" so the handoff pill is exercised.
          state: { ...tvDevice.state, status: 'playing' },
        },
      });
      return;
    }

    if (message.type === 'state') {
      if (message.state?.status === 'playing') {
        tvDevice.online = true;
        tvDevice.state = { ...tvDevice.state, status: 'paused' };
        send({ type: 'device', device: tvDevice });
      }
      return;
    }

    if (message.type === 'command') {
      const command = message.command ?? {};
      if (command.action === 'setVolume' && typeof command.volume === 'number') {
        tvDevice.state = {
          ...tvDevice.state,
          volume: Math.max(0, Math.min(100, Math.round(command.volume))),
        };
        send({ type: 'device', device: tvDevice });
      } else if (
        command.action === 'play' ||
        command.action === 'pause' ||
        command.action === 'toggle'
      ) {
        const playing =
          command.action === 'toggle'
            ? tvDevice.state.status !== 'playing'
            : command.action === 'play';
        tvDevice.state = {
          ...tvDevice.state,
          status: playing ? 'playing' : 'paused',
        };
        send({ type: 'device', device: tvDevice });
      } else if (command.action === 'next' || command.action === 'previous') {
        tvDevice.state = { ...tvDevice.state, status: 'playing' };
        send({ type: 'device', device: tvDevice });
      }
      send({ type: 'result', re: message.id, ok: true });
      return;
    }

    if (message.type === 'transfer') {
      const target = message.to;
      if (target === tvDevice.id) {
        tvDevice.state = { ...tvDevice.state, status: message.play === false ? 'paused' : 'playing' };
        send({ type: 'device', device: tvDevice });
        send({
          type: 'lastPlayback',
          lastPlayback: { deviceId: tvDevice.id, deviceName: tvDevice.name, state: tvDevice.state },
        });
        send({ type: 'command', id: 'mock-stop-source', command: { action: 'stop' } });
      }
      if (target === deviceId) {
        send({
          type: 'command',
          id: 'mock-setqueue',
          from: 'mock-controller',
          command: {
            action: 'setQueue',
            queue: tvDevice.state.queue,
            index: tvDevice.state.index,
            positionMs: tvDevice.state.positionMs,
            play: message.play ?? true,
            repeat: tvDevice.state.repeat,
            shuffle: tvDevice.state.shuffle,
            order: tvDevice.state.order,
          },
        });
      }
      if (message.id) send({ type: 'result', re: message.id, ok: true });
      return;
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Laila mock server on http://${HOST}:${PORT}`);
  console.log(`Segue hub: ws://${HOST}:${PORT}/connect/v1/ws`);
  console.log(`Use any username and any password/API key (mock only).`);
});
