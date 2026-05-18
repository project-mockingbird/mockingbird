// src/spe/provider-csharp/Mockingbird.Provider/MockingbirdFieldCollection.cs
using System;
using System.Collections;
using System.Collections.Generic;

namespace Mockingbird.Provider;

/// <summary>
/// String-keyed field bag exposing both the indexer (<c>$item.Fields["Title"]</c>)
/// and dictionary semantics so PowerShell's <c>$item["Title"]</c> sugar works.
///
/// Phase 3 limitation: shared, unversioned, and versioned fields are flattened
/// into one bag. SPE distinguishes scope via Field.Shared / Field.Unversioned;
/// Mockingbird's cmdlet surface does not. The Add() loop in ApiClient.NodeToItem
/// walks shared -> unversioned -> versioned, so versioned-wins precedence applies
/// when the same field id appears in multiple scopes (matches Sitecore precedence).
///
/// Indexer setter routes through the attached <see cref="MockingbirdEditContext"/>
/// when one is present; bare collections (constructed without an item) raise
/// the standard "not in edit mode" error to keep the contract consistent.
/// </summary>
public class MockingbirdFieldCollection : IEnumerable<KeyValuePair<string, string>>
{
    private readonly Dictionary<string, string> _byName = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> _byId = new(StringComparer.OrdinalIgnoreCase);
    // Name -> canonical field GUID lookup. Populated by Add() when both id and
    // name are provided. Used by the edit context to resolve a user-supplied
    // name like "Title" to the field's actual GUID before issuing a PUT - the
    // mutate path is GUID-keyed, so without resolution PUT would write a
    // ghost "title" field instead of updating the existing one.
    private readonly Dictionary<string, string> _idByName = new(StringComparer.OrdinalIgnoreCase);
    private MockingbirdEditContext? _editContext;

    public string? this[string nameOrId]
    {
        get
        {
            if (nameOrId is null) return null;
            if (_byName.TryGetValue(nameOrId, out var v)) return v;
            if (_byId.TryGetValue(nameOrId, out v)) return v;
            return null;
        }
        set
        {
            if (nameOrId is null) throw new ArgumentNullException(nameof(nameOrId));
            if (_editContext is null)
            {
                throw new InvalidOperationException(
                    "Field assignment requires an attached edit context. Use a MockingbirdItem-owned collection.");
            }
            _editContext.SetPending(nameOrId, value ?? "");
        }
    }

    public IEnumerable<string> Names => _byName.Keys;
    public int Count => _byName.Count;

    /// <summary>
    /// Adds a field. Caller controls iteration order; later Add calls with the
    /// same id/name silently overwrite earlier ones. Caller is responsible for
    /// ordering shared -> unversioned -> versioned to get correct precedence.
    /// </summary>
    public void Add(string id, string name, string value)
    {
        if (!string.IsNullOrEmpty(name)) _byName[name] = value;
        if (!string.IsNullOrEmpty(id)) _byId[id] = value;
        if (!string.IsNullOrEmpty(name) && !string.IsNullOrEmpty(id)) _idByName[name] = id;
    }

    /// <summary>
    /// Resolve a user-supplied key to the field's canonical GUID. Returns
    /// the resolved GUID for known names, the input verbatim for keys
    /// already in id form, and null when neither map has a hit (the
    /// caller should then send the raw input and accept ghost-field
    /// semantics on the server side).
    /// </summary>
    internal string? ResolveId(string nameOrId)
    {
        if (string.IsNullOrEmpty(nameOrId)) return null;
        if (_byId.ContainsKey(nameOrId)) return nameOrId;
        return _idByName.TryGetValue(nameOrId, out var id) ? id : null;
    }

    public IEnumerator<KeyValuePair<string, string>> GetEnumerator() => _byName.GetEnumerator();
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();

    /// <summary>
    /// Wire the field collection to its parent item's edit context. Called
    /// from <see cref="MockingbirdItem"/>'s constructor.
    /// </summary>
    internal void AttachEditContext(MockingbirdEditContext context)
    {
        _editContext = context;
    }

    /// <summary>
    /// Update the local cache mid-edit so subsequent reads inside the edit
    /// block see the new value. Writes to both the name and id maps when
    /// the key matches an existing entry; otherwise records under the key
    /// the caller supplied.
    /// </summary>
    internal void UpdateCached(string nameOrId, string value)
    {
        var hit = false;
        if (_byName.ContainsKey(nameOrId)) { _byName[nameOrId] = value; hit = true; }
        if (_byId.ContainsKey(nameOrId)) { _byId[nameOrId] = value; hit = true; }
        if (!hit) _byName[nameOrId] = value;
    }

    /// <summary>
    /// Restore the pre-edit value for a field on CancelEdit. Null indicates
    /// the field was absent from the cache before the edit - we remove it
    /// rather than store null.
    /// </summary>
    internal void RevertCached(string nameOrId, string? originalValue)
    {
        if (originalValue is null)
        {
            _byName.Remove(nameOrId);
            _byId.Remove(nameOrId);
            return;
        }
        if (_byName.ContainsKey(nameOrId)) _byName[nameOrId] = originalValue;
        if (_byId.ContainsKey(nameOrId)) _byId[nameOrId] = originalValue;
    }
}
