import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseMountInfo,
  translateContainerToHostPath,
  toHostPath,
  toHostPathWithReader,
  _resetHostPathCacheForTest,
  type MountEntry,
} from '../../src/api/host-path.js';

describe('parseMountInfo', () => {
  it('extracts mount point and source from a typical bind mount line', () => {
    // Real-shape line from /proc/self/mountinfo for a Docker bind mount.
    // Field 5 is the mount point, the field after the literal `-` is fs type,
    // followed by the source.
    const text = [
      '36 35 0:30 / /app/data/serialization rw,relatime master:1 - ext4 /run/desktop/mnt/host/c/projects/foo/authoring/items rw',
    ].join('\n');
    const entries = parseMountInfo(text);
    expect(entries).toEqual<MountEntry[]>([
      {
        mountPoint: '/app/data/serialization',
        source: '/run/desktop/mnt/host/c/projects/foo/authoring/items',
      },
    ]);
  });

  it('parses multiple lines and ignores blanks; synthetic root overlay is skipped', () => {
    // The root overlayfs mount has source="overlay" (the fsType name itself,
    // not a host path). It must not be picked up as a translatable mount,
    // otherwise paths outside any real bind mount fall back to it and produce
    // a meaningless `overlay/...` host-path string.
    const text = [
      '1 0 0:1 / / rw - overlay overlay rw',
      '',
      '36 35 0:30 / /app/data rw - ext4 /srv/content-tree rw',
      '37 36 0:31 / /app/data/serialization rw - ext4 /srv/content-tree/serialization rw',
    ].join('\n');
    const entries = parseMountInfo(text);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ mountPoint: '/app/data', source: '/srv/content-tree' });
    expect(entries[1]).toEqual({
      mountPoint: '/app/data/serialization',
      source: '/srv/content-tree/serialization',
    });
  });

  it('skips synthetic mount sources (overlay, tmpfs, proc, sysfs, cgroup, devpts, mqueue)', () => {
    // Every entry below has its source field set to the fsType name, which
    // the kernel does for synthetic filesystems. None of these are real host
    // paths and using them as a translation target produces nonsense.
    const text = [
      '1 0 0:1 / / rw - overlay overlay rw',
      '2 1 0:2 / /proc rw - proc proc rw',
      '3 1 0:3 / /sys rw - sysfs sysfs rw',
      '4 1 0:4 / /dev rw - tmpfs tmpfs rw,size=65536k',
      '5 4 0:5 / /dev/pts rw - devpts devpts rw,gid=5,mode=620',
      '6 4 0:6 / /dev/mqueue rw - mqueue mqueue rw',
      '7 3 0:7 / /sys/fs/cgroup rw - cgroup2 cgroup rw',
      '8 1 0:8 / /app/data rw - ext4 /srv/content-tree rw',
    ].join('\n');
    const entries = parseMountInfo(text);
    expect(entries).toEqual<MountEntry[]>([
      { mountPoint: '/app/data', source: '/srv/content-tree' },
    ]);
  });

  it('real container mountinfo: root overlay + 9p bind mounts -> only the binds become translatable', () => {
    // Slimmed real-shape mountinfo from a Docker Desktop on Windows + WSL2
    // container. The container root is overlayfs; user data is mounted via
    // three 9p binds to host paths under C:\projects. Only the 9p entries
    // should produce translatable mount entries.
    const text = [
      '1318 1188 0:214 / / rw,relatime master:175 - overlay overlay rw,lowerdir=/var/lib/docker/overlay2/l/A:/var/lib/docker/overlay2/l/B,upperdir=/var/lib/docker/overlay2/X/diff,workdir=/var/lib/docker/overlay2/X/work',
      '1320 1318 0:224 / /proc rw,nosuid,nodev,noexec,relatime - proc proc rw',
      '1322 1318 0:227 / /dev rw,nosuid - tmpfs tmpfs rw,size=65536k,mode=755',
      '1326 1318 0:231 / /sys ro,nosuid,nodev,noexec,relatime - sysfs sysfs ro',
      '1368 1318 0:108 /projects/foo/authoring /scs rw,noatime - 9p C:\\134 rw,aname=drvfs;path=C:\\;uid=0;gid=0;metadata',
      '1369 1318 0:108 /projects/foo/migration /scs-content rw,noatime - 9p C:\\134 rw,aname=drvfs;path=C:\\;uid=0;gid=0;metadata',
      '1370 1318 0:108 /projects/foo/cache /data/cache rw,noatime - 9p C:\\134 rw,aname=drvfs;path=C:\\;uid=0;gid=0;metadata',
    ].join('\n');
    const entries = parseMountInfo(text);
    expect(entries).toEqual<MountEntry[]>([
      { mountPoint: '/scs', source: 'C:\\projects\\foo\\authoring' },
      { mountPoint: '/scs-content', source: 'C:\\projects\\foo\\migration' },
      { mountPoint: '/data/cache', source: 'C:\\projects\\foo\\cache' },
    ]);
  });

  it('handles optional fields between parent ID and the dash separator', () => {
    // Some mount lines include things like `master:1 propagate_from:2` between
    // the optional-fields slot and the `-` separator. The 5th whitespace field
    // is still the mount point, and source is still the second field after `-`.
    const text =
      '36 35 0:30 / /app/data/serialization rw,relatime shared:1 master:2 - ext4 /srv/content-tree/serialization rw';
    const entries = parseMountInfo(text);
    expect(entries).toEqual<MountEntry[]>([
      { mountPoint: '/app/data/serialization', source: '/srv/content-tree/serialization' },
    ]);
  });

  it('skips malformed lines (missing dash separator)', () => {
    const text = [
      '36 35 0:30 / /app/data/serialization rw,relatime ext4 /srv/content-tree rw', // no `-`
      '37 36 0:31 / /app/data rw - ext4 /srv/content-tree rw',
    ].join('\n');
    const entries = parseMountInfo(text);
    expect(entries).toEqual<MountEntry[]>([
      { mountPoint: '/app/data', source: '/srv/content-tree' },
    ]);
  });

  it('Docker Desktop on Windows + WSL2 backend (9p): combines path= from super-options with the field-4 root', () => {
    // Real-shape line from Docker Desktop on Windows with WSL2 integration enabled.
    // Field 4 (root) is the host subpath; field 9 is `9p`; field 10 (source) is the
    // 9p tag (a Docker-internal id like `C:\134`, NOT a host path); field 11
    // (super-opts) carries `path=C:\`, the actual host root, plus `aname=drvfs` as
    // a Docker-Desktop fingerprint.
    const text =
      '1541 1514 0:108 /projects/foo/bar/authoring/items /app/data/serialization rw,noatime - 9p C:\\134 rw,dirsync,aname=drvfs;path=C:\\;uid=0;gid=0;metadata;symlinkroot=/mnt/host/,mmap,access=client,msize=65536,trans=fd,rfd=4,wfd=4';
    const entries = parseMountInfo(text);
    expect(entries).toEqual<MountEntry[]>([
      {
        mountPoint: '/app/data/serialization',
        source: 'C:\\projects\\foo\\bar\\authoring\\items',
      },
    ]);
  });

  it('9p with path=/Users/... and root=/ (hypothetical macOS shape): pass-through', () => {
    const text =
      '36 35 0:30 / /app/data/serialization rw,noatime - 9p sometag rw,aname=drvfs;path=/Users/foo/repo;uid=0';
    const entries = parseMountInfo(text);
    expect(entries).toEqual<MountEntry[]>([
      { mountPoint: '/app/data/serialization', source: '/Users/foo/repo' },
    ]);
  });

  it('9p missing path= entirely: line is skipped (graceful degradation)', () => {
    const text = [
      '36 35 0:30 / /app/data/serialization rw,noatime - 9p sometag rw,aname=drvfs;uid=0',
      '37 36 0:31 / /app/data/cache rw - ext4 /srv/cache rw',
    ].join('\n');
    const entries = parseMountInfo(text);
    expect(entries).toEqual<MountEntry[]>([
      { mountPoint: '/app/data/cache', source: '/srv/cache' },
    ]);
  });
});

describe('translateContainerToHostPath', () => {
  it('Linux native: returns source-prefixed path with forward slashes', () => {
    const mounts: MountEntry[] = [
      { mountPoint: '/app/data/serialization', source: '/srv/mockingbird/serialization' },
    ];
    const out = translateContainerToHostPath(
      '/app/data/serialization/foo/bar.yml',
      mounts,
    );
    expect(out).toBe('/srv/mockingbird/serialization/foo/bar.yml');
  });

  it('Docker Desktop on Windows: rewrites /run/desktop/mnt/host/<drive>/ to <Drive>:\\ with backslashes', () => {
    const mounts: MountEntry[] = [
      {
        mountPoint: '/app/data/serialization',
        source: '/run/desktop/mnt/host/c/projects/foo/authoring/items',
      },
    ];
    const out = translateContainerToHostPath(
      '/app/data/serialization/templates/baz.yml',
      mounts,
    );
    expect(out).toBe('C:\\projects\\foo\\authoring\\items\\templates\\baz.yml');
  });

  it('uppercases the drive letter regardless of source casing', () => {
    const mounts: MountEntry[] = [
      {
        mountPoint: '/app/data/serialization',
        source: '/run/desktop/mnt/host/d/work/items',
      },
    ];
    const out = translateContainerToHostPath(
      '/app/data/serialization/x.yml',
      mounts,
    );
    expect(out).toBe('D:\\work\\items\\x.yml');
  });

  it('Docker Desktop on macOS: source already lives in user namespace, leave as-is', () => {
    const mounts: MountEntry[] = [
      {
        mountPoint: '/app/data/serialization',
        source: '/Users/jason/projects/foo',
      },
    ];
    const out = translateContainerToHostPath(
      '/app/data/serialization/templates/baz.yml',
      mounts,
    );
    expect(out).toBe('/Users/jason/projects/foo/templates/baz.yml');
  });

  it('longest-prefix wins when multiple mounts overlap', () => {
    const mounts: MountEntry[] = [
      { mountPoint: '/app/data', source: '/srv/parent' },
      { mountPoint: '/app/data/serialization', source: '/srv/child' },
    ];
    const out = translateContainerToHostPath(
      '/app/data/serialization/foo.yml',
      mounts,
    );
    expect(out).toBe('/srv/child/foo.yml');
  });

  it('longest-prefix wins regardless of mount entry order', () => {
    const mounts: MountEntry[] = [
      { mountPoint: '/app/data/serialization', source: '/srv/child' },
      { mountPoint: '/app/data', source: '/srv/parent' },
    ];
    const out = translateContainerToHostPath(
      '/app/data/serialization/foo.yml',
      mounts,
    );
    expect(out).toBe('/srv/child/foo.yml');
  });

  it('returns the input unchanged when no mount matches', () => {
    const mounts: MountEntry[] = [
      { mountPoint: '/some/other/place', source: '/srv/elsewhere' },
    ];
    const out = translateContainerToHostPath('/app/data/foo.yml', mounts);
    expect(out).toBe('/app/data/foo.yml');
  });

  it('returns the input unchanged when the mount list is empty', () => {
    const out = translateContainerToHostPath('/app/data/foo.yml', []);
    expect(out).toBe('/app/data/foo.yml');
  });

  it('does not match a mount point that is a sibling rather than a prefix', () => {
    // Container path is /app/datastore/x; mount is at /app/data. A naive
    // string-startswith would match; we require a path-segment boundary.
    const mounts: MountEntry[] = [
      { mountPoint: '/app/data', source: '/srv/data' },
    ];
    const out = translateContainerToHostPath('/app/datastore/x.yml', mounts);
    expect(out).toBe('/app/datastore/x.yml');
  });

  it('matches when the container path equals the mount point exactly', () => {
    const mounts: MountEntry[] = [
      { mountPoint: '/app/data/serialization', source: '/srv/content-tree' },
    ];
    const out = translateContainerToHostPath('/app/data/serialization', mounts);
    expect(out).toBe('/srv/content-tree');
  });

  it('Docker Desktop Windows source with no extra path segments', () => {
    const mounts: MountEntry[] = [
      {
        mountPoint: '/app/data/serialization',
        source: '/run/desktop/mnt/host/c',
      },
    ];
    const out = translateContainerToHostPath('/app/data/serialization/foo.yml', mounts);
    expect(out).toBe('C:\\foo.yml');
  });

  it('returns input unchanged when input is empty', () => {
    const out = translateContainerToHostPath('', [
      { mountPoint: '/app/data', source: '/srv' },
    ]);
    expect(out).toBe('');
  });

  it('path outside every bind mount: returns input unchanged, never falls through to root overlay', () => {
    // The root overlayfs entry from /proc/self/mountinfo has source="overlay".
    // If parseMountInfo accepted it, longest-prefix match against `/` would
    // succeed for any container path and produce `overlay/...`. parseMountInfo
    // must skip that entry so unmappable paths show as the raw container
    // path - useful as a debugging hint - rather than a fictitious string.
    const text = [
      '1318 1188 0:214 / / rw,relatime master:175 - overlay overlay rw,lowerdir=/var/lib/docker/overlay2/l/A',
      '1368 1318 0:108 /projects/foo/authoring /scs rw,noatime - 9p C:\\134 rw,aname=drvfs;path=C:\\;uid=0;gid=0;metadata',
    ].join('\n');
    const mounts = parseMountInfo(text);
    const out = translateContainerToHostPath(
      '/app/data/content/items/foo.yml',
      mounts,
    );
    expect(out).toBe('/app/data/content/items/foo.yml');
  });

  it('Docker Desktop Windows WSL2 (9p): translates a container path to the Windows host path end-to-end', () => {
    // Direct integration: feed the parser output for the 9p shape and confirm
    // a real container path round-trips to a real Windows host path.
    const text =
      '1541 1514 0:108 /projects/foo/bar/authoring/items /app/data/serialization rw,noatime - 9p C:\\134 rw,dirsync,aname=drvfs;path=C:\\;uid=0;gid=0';
    const mounts = parseMountInfo(text);
    const out = translateContainerToHostPath(
      '/app/data/serialization/templates/baz.yml',
      mounts,
    );
    expect(out).toBe('C:\\projects\\foo\\bar\\authoring\\items\\templates\\baz.yml');
  });
});

describe('toHostPathWithReader', () => {
  it('returns the input unchanged when reader returns null (no mountinfo)', () => {
    const out = toHostPathWithReader('/app/data/serialization/foo.yml', () => null);
    expect(out).toBe('/app/data/serialization/foo.yml');
  });

  it('translates via mountinfo text supplied by the reader', () => {
    const text =
      '36 35 0:30 / /app/data/serialization rw - ext4 /run/desktop/mnt/host/c/work rw';
    const out = toHostPathWithReader(
      '/app/data/serialization/foo.yml',
      () => text,
    );
    expect(out).toBe('C:\\work\\foo.yml');
  });
});

describe('toHostPath (cached, real /proc/self/mountinfo)', () => {
  beforeEach(() => {
    _resetHostPathCacheForTest();
  });

  it('returns the input unchanged when no mount matches (covers the typical CI / dev case)', () => {
    // We can't assume anything about the real mountinfo where this test runs,
    // but a deeply-fake container path will never match a real mount, so the
    // contract "returns input unchanged when nothing matches" still holds.
    const fake = '/this/path/should/never/be/a/mount/abc.yml';
    expect(toHostPath(fake)).toBe(fake);
  });

  it('returns empty string when given empty string', () => {
    expect(toHostPath('')).toBe('');
  });
});
