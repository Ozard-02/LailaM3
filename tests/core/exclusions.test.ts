import { describe, expect, it } from 'vitest';
import type { Playlist } from '@/core/models';
import { isPlaylistExclusive, withExclusiveComment } from '@/core/exclusions';

const playlist = (comment?: string) => ({ id: 'pl-1', name: 'Playlist', comment }) as Playlist;

describe('exclude-from-shuffle comment', () => {
  it('adds the tag without dropping existing text', () => {
    expect(withExclusiveComment(undefined, 'laila', true)).toBe('#laila-exclusive');
    expect(withExclusiveComment('moody', 'laila', true)).toBe('moody #laila-exclusive');
    expect(withExclusiveComment('moody road', 'laila', true)).toBe(
      'moody road #laila-exclusive',
    );
  });

  it('removes the tag and preserves other text and tags', () => {
    expect(withExclusiveComment('moody #laila-exclusive road', 'laila', false)).toBe(
      'moody road',
    );
    expect(withExclusiveComment('#laila-exclusive #other-tag', 'laila', false)).toBe(
      '#other-tag',
    );
    expect(
      withExclusiveComment('#laila-exclusive #laila-exclusive road', 'laila', false),
    ).toBe('road');
  });

  it('does not match a tag that is only a prefix of another word', () => {
    expect(withExclusiveComment('#laila-exclusive-extra', 'laila', false)).toBe(
      '#laila-exclusive-extra',
    );
    expect(isPlaylistExclusive(playlist('#laila-exclusive-extra'), 'laila')).toBe(false);
    expect(isPlaylistExclusive(playlist('moody #laila-exclusive'), 'laila')).toBe(true);
  });
});
