// src/spe/provider-csharp/Mockingbird.Provider/MockingbirdEditContext.cs
using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Mockingbird.Provider;

/// <summary>
/// SPE-compatible edit context for buffered field writes.
///
/// Usage from PowerShell mirrors real Sitecore SPE:
/// <code>
/// $item.Editing.BeginEdit()
/// $item["Title"] = "New title"
/// $item.Editing.EndEdit()
/// </code>
///
/// Semantics:
/// <list type="bullet">
/// <item>Depth-counted: nested BeginEdit / EndEdit pairs are allowed; only the
/// outermost EndEdit commits.</item>
/// <item>Indexer setters on <see cref="MockingbirdFieldCollection"/> throw if
/// invoked while not in an edit context.</item>
/// <item>Assignments update the local field cache mid-edit so subsequent reads
/// inside the block see the new values. CancelEdit restores the pre-edit
/// values from a snapshot taken on the outermost BeginEdit.</item>
/// <item>EndEdit at depth 0 issues a single PUT /api/items/:id with all
/// buffered fields when MOCKINGBIRD_APPLY=1, or POST /api/items/preview-update
/// in dry-run mode where it emits a single framed `diff` line on stdout that
/// the host parses into a diff frame.</item>
/// <item>Successful commits leave the local cache in its mid-edit state (no
/// re-fetch); the API is a pure store with no server-side field transforms.</item>
/// </list>
/// </summary>
public class MockingbirdEditContext
{
    private readonly MockingbirdItem _item;
    private readonly Dictionary<string, string> _pending = new(StringComparer.OrdinalIgnoreCase);
    /// <summary>
    /// Snapshot of original field values taken when the OUTERMOST BeginEdit
    /// fires. Used by CancelEdit to restore the cache. Keys are whatever
    /// identifier the user assigned through (name or id); values are
    /// pre-edit reads via <see cref="MockingbirdFieldCollection.this"/>.
    /// Null/empty value indicates the field had no entry in the cache.
    /// </summary>
    private readonly Dictionary<string, string?> _snapshot = new(StringComparer.OrdinalIgnoreCase);
    private int _depth;

    public MockingbirdEditContext(MockingbirdItem item)
    {
        _item = item;
    }

    /// <summary>True when at least one BeginEdit has fired without a matching EndEdit.</summary>
    public bool IsEditing => _depth > 0;

    /// <summary>Pending field changes buffered since the outermost BeginEdit. Read-only view.</summary>
    public IReadOnlyDictionary<string, string> Pending => _pending;

    public void BeginEdit()
    {
        _depth++;
    }

    public void EndEdit()
    {
        if (_depth == 0)
        {
            // SPE silently no-ops when EndEdit is called without a matching
            // BeginEdit. We match.
            return;
        }
        _depth--;
        if (_depth > 0) return; // nested; defer commit
        if (_pending.Count == 0)
        {
            _snapshot.Clear();
            return;
        }
        var apply = Environment.GetEnvironmentVariable("MOCKINGBIRD_APPLY") == "1";
        // Resolve user-supplied keys (which may be names like "Title" or
        // GUIDs) to canonical field GUIDs where possible. The PUT route
        // treats unknown keys as new field IDs, so without resolution a
        // write to "Title" creates a ghost field instead of updating the
        // existing one. Keys not in the cache pass through verbatim - that
        // path matches Set-ItemField's existing behavior.
        var resolved = new Dictionary<string, string>(_pending.Count, StringComparer.OrdinalIgnoreCase);
        foreach (var kv in _pending)
        {
            var canonical = _item.Fields.ResolveId(kv.Key) ?? kv.Key;
            resolved[canonical] = kv.Value;
        }
        try
        {
            if (apply)
            {
                ApiClient.UpdateItemFields(_item.ID, resolved, _item.Language, _item.Version);
            }
            else
            {
                var planJson = ApiClient.PreviewUpdate(_item.ID, resolved, _item.Language, _item.Version);
                EmitDiffFrame(planJson);
            }
        }
        finally
        {
            // Whether commit succeeded or threw, clear the buffer + snapshot.
            // The mid-edit cache values stand; callers wanting a clean slate
            // call BeginEdit again to re-snapshot.
            _pending.Clear();
            _snapshot.Clear();
        }
    }

    public void CancelEdit()
    {
        if (_depth == 0) return;
        // Restore the cache to its pre-edit state and clear pending state.
        foreach (var kv in _snapshot)
        {
            _item.Fields.RevertCached(kv.Key, kv.Value);
        }
        _snapshot.Clear();
        _pending.Clear();
        _depth = 0;
    }

    /// <summary>
    /// Called by <see cref="MockingbirdFieldCollection"/>'s indexer setter.
    /// Buffers the pending change AND updates the local cache so subsequent
    /// reads inside the edit block see the new value. Snapshots the
    /// pre-edit value the first time each field is touched in this edit so
    /// CancelEdit can restore it.
    /// </summary>
    internal void SetPending(string nameOrId, string value)
    {
        if (_depth == 0)
        {
            throw new InvalidOperationException(
                "Call $item.Editing.BeginEdit() before assigning fields, or use Set-ItemField for one-shot writes.");
        }
        if (!_snapshot.ContainsKey(nameOrId))
        {
            _snapshot[nameOrId] = _item.Fields[nameOrId];
        }
        _pending[nameOrId] = value;
        _item.Fields.UpdateCached(nameOrId, value);
    }

    /// <summary>
    /// Emit a single framed diff line so the host's frame-parser turns it
    /// into a `diff` frame the IsePage can render. Hardcoded prefix matches
    /// <c>FRAME_PREFIX</c> in <c>src/spe/host/frame-parser.ts</c> and the
    /// <c>$global:MockingbirdFramePrefix</c> assignment in
    /// <c>src/spe/host/startup-template.ts</c>; bump both together if it ever
    /// changes.
    /// </summary>
    private void EmitDiffFrame(string planJson)
    {
        const string framePrefix = "__M_FRAME__";
        var plan = JsonNode.Parse(planJson);
        var summary = plan?["summary"];
        var warnings = plan?["warnings"];
        var diff = plan?["diff"];
        var payload = new JsonObject
        {
            ["type"] = "diff",
            ["format"] = "unified",
            ["operation"] = $"EndEdit on {_item.Paths.FullPath}",
            ["summary"] = summary is null ? null : JsonNode.Parse(summary.ToJsonString()),
            ["warnings"] = warnings is null ? new JsonArray() : JsonNode.Parse(warnings.ToJsonString()),
            ["data"] = diff is null ? null : JsonNode.Parse(diff.ToJsonString()),
        };
        Console.WriteLine(framePrefix + payload.ToJsonString(new JsonSerializerOptions { WriteIndented = false }));
    }
}
