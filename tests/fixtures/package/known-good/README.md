# Known-good Sitecore package fixture

This directory holds a single Sitecore-Desktop-built package, used by Phase 2
of the Package Builder feature as the empirical gate for the item-XML emitter,
properties emitter, metadata emitter, and zip layout.

## Contents

- `package-from-sitecore.zip` - the package as Sitecore Desktop emitted it.
  Outer `.zip` containing one `package.zip` entry (the inner zip).
- `expected-inner/` - the inner zip's contents extracted to the filesystem.
  Tests compare emitter output against these bytes.
- `source-tree.yml` - the SCS YAML representation of the same item, in the
  shape mockingbird's parser produces. Tests parse this into an `ScsItem`,
  feed it to the emitters, and compare to `expected-inner/`.

## Item

- Path: `/sitecore/content/Home` (the OOTB Sitecore Home item).
- ID: `{110D559F-DEA5-42EA-9C1C-8A5DF7E70EF9}`.
- Template: `Sample Item` (`{76036F5E-CBCE-46D1-AF0A-4143F9B557AA}`, OOTB).
- One language (`en`), one version (`1`).
- Has a mix of populated standard fields, two populated content fields
  (`Title`, `Text`), and many empty-content fields.

## Package metadata (verbatim from Sitecore Desktop)

- Name: `Content Package`
- Author: `Jason Wilkerson`
- Publisher: `Sitecore Ukraine`
- Version: `1`
- Readme: empty (zero-byte entry)
- Installer version: `41.00.000000.000000`

## How this fixture was built

In Sitecore Desktop on a real Sitecore 10.x environment:

1. Open the Package Designer.
2. Add a static source: the `/sitecore/content/Home` item, scope = SingleItem.
3. Set metadata: PackageName=`Content Package`, Author=`Jason Wilkerson`,
   Publisher=`Sitecore Ukraine`, Version=`1`.
4. Click Generate ZIP. Save as `DefaultHome-1.zip`.
5. Place at `tests/fixtures/package/known-good/package-from-sitecore.zip`.
6. Extract: `unzip package-from-sitecore.zip -d outer && unzip outer/package.zip -d expected-inner` (then move `expected-inner/` into place).

## Notes for emitter implementers

- Real Sitecore emits **every field defined on the item's template**, including
  empty-content fields. Mockingbird's YAML format only stores populated fields.
  The fixture round-trip test should normalize both sides by stripping
  empty-content `<field>` elements before comparison (or accept structural
  rather than byte-for-byte equality on the item XML).
- The properties dictionary's `fieldproperties` value lists every field on the
  template with its sharing type (`Shared`/`Versioned`/`Unversioned`), not just
  populated fields. Reproducing this requires walking the template's field
  definitions via the IAR registry; a structural-equality comparison (matching
  populated-field entries only) is the pragmatic v1 target.
- The properties file has additional install-config keys (`id_InstallMode`,
  `id_VersionMergeMode`) not predicted by the format reference doc. These are
  per-source install behavior overrides emitted by the Package Designer; v1
  may omit them (parser tolerates), accepting that round-trip via Package
  Designer would be lossy.
