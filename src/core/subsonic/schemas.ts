import * as v from 'valibot';

const optionalString = v.optional(v.string());
const optionalNumber = v.optional(v.number());

export const SubsonicErrorSchema = v.object({
  code: v.optional(v.union([v.number(), v.string()])),
  message: v.optional(v.string()),
  helpUrl: v.optional(v.string()),
});

export const SubsonicEnvelopeSchema = v.object({
  status: v.optional(v.picklist(['ok', 'failed'])),
  version: v.optional(v.string()),
  error: v.optional(SubsonicErrorSchema),
});

/**
 * Lenient model schemas. Subsonic servers differ in optional fields, so the
 * boundary validates types and required ids; unknown fields are ignored.
 */
export const TrackSchema = v.object({
  id: v.string(),
  title: optionalString,
  name: optionalString,
  artist: optionalString,
  artistId: optionalString,
  album: optionalString,
  albumId: optionalString,
  coverArt: optionalString,
  duration: optionalNumber,
  track: optionalNumber,
  discNumber: optionalNumber,
  year: optionalNumber,
  genre: optionalString,
  bitRate: optionalNumber,
  suffix: optionalString,
  contentType: optionalString,
  size: optionalNumber,
  starred: optionalString,
});

export const AlbumSchema = v.object({
  id: v.string(),
  name: optionalString,
  title: optionalString,
  artist: optionalString,
  artistId: optionalString,
  coverArt: optionalString,
  songCount: optionalNumber,
  duration: optionalNumber,
  year: optionalNumber,
  genre: optionalString,
  starred: optionalString,
  song: v.optional(v.array(v.unknown())),
});

export const ArtistSchema = v.object({
  id: v.string(),
  name: optionalString,
  coverArt: optionalString,
  albumCount: optionalNumber,
  starred: optionalString,
  album: v.optional(v.array(v.unknown())),
});

export const PlaylistSchema = v.object({
  id: v.string(),
  name: optionalString,
  comment: optionalString,
  owner: optionalString,
  songCount: optionalNumber,
  duration: optionalNumber,
  coverArt: optionalString,
  entry: v.optional(v.array(v.unknown())),
});

export const GenreSchema = v.object({
  value: optionalString,
  name: optionalString,
  songCount: optionalNumber,
  albumCount: optionalNumber,
});

export type ParsedSubsonicEnvelope = v.InferOutput<typeof SubsonicEnvelopeSchema>;
