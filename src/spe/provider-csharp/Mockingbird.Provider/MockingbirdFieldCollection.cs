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
/// </summary>
public class MockingbirdFieldCollection : IEnumerable<KeyValuePair<string, string>>
{
    private readonly Dictionary<string, string> _byName = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> _byId = new(StringComparer.OrdinalIgnoreCase);

    public string? this[string nameOrId]
    {
        get
        {
            if (nameOrId is null) return null;
            if (_byName.TryGetValue(nameOrId, out var v)) return v;
            if (_byId.TryGetValue(nameOrId, out v)) return v;
            return null;
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
    }

    public IEnumerator<KeyValuePair<string, string>> GetEnumerator() => _byName.GetEnumerator();
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
}
