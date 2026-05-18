// src/spe/provider-csharp/Mockingbird.Provider/ApiClient.cs
using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Mockingbird.Provider;

/// <summary>
/// Thin HTTP wrapper for cmdlets to call the local Mockingbird API.
/// Reads MOCKINGBIRD_API_URL from the process environment at first use.
/// </summary>
public static class ApiClient
{
    private static readonly Lazy<HttpClient> _http = new(() =>
    {
        var url = Environment.GetEnvironmentVariable("MOCKINGBIRD_API_URL")
                  ?? "http://127.0.0.1:3000";
        var c = new HttpClient { BaseAddress = new Uri(url), Timeout = TimeSpan.FromSeconds(30) };
        // Identify ourselves so server logs distinguish PS-cmdlet traffic from
        // browser / Web UI / curl callers. Assembly version defaults to 1.0.0
        // when not set in the csproj.
        var version = typeof(ApiClient).Assembly.GetName().Version?.ToString(3) ?? "1.0";
        c.DefaultRequestHeaders.UserAgent.ParseAdd($"Mockingbird-Provider/{version}");
        return c;
    });

    public static MockingbirdItem? GetItemByPath(string path, string database = "master")
    {
        var clean = StripDrive(path);
        var resp = _http.Value.GetAsync($"/api/items/by-path?path={Uri.EscapeDataString(clean)}").Result;
        if (resp.StatusCode == System.Net.HttpStatusCode.NotFound) return null;
        resp.EnsureSuccessStatusCode();
        return DeserializeItem(resp.Content.ReadAsStringAsync().Result, database);
    }

    public static MockingbirdItem? GetItemById(string id, string database = "master")
    {
        var resp = _http.Value.GetAsync($"/api/items/{id}").Result;
        if (resp.StatusCode == System.Net.HttpStatusCode.NotFound) return null;
        resp.EnsureSuccessStatusCode();
        return DeserializeItem(resp.Content.ReadAsStringAsync().Result, database);
    }

    /// <summary>
    /// List direct children of <paramref name="parentPath"/>. Uses
    /// <c>GET /api/tree?root=&lt;path&gt;&amp;depth=1</c>; the response is the parent
    /// subtree (a single TreeNodeResponse) with a <c>children</c> array of
    /// child TreeNodeResponse entries. We then materialize each child as a
    /// MockingbirdItem by calling /api/items/:id.
    /// </summary>
    public static System.Collections.Generic.List<MockingbirdItem> GetChildren(string parentPath, string database = "master")
    {
        var clean = StripDrive(parentPath);
        var resp = _http.Value.GetAsync($"/api/tree?root={Uri.EscapeDataString(clean)}&depth=1&db={Uri.EscapeDataString(database)}").Result;
        var result = new System.Collections.Generic.List<MockingbirdItem>();
        if (!resp.IsSuccessStatusCode) return result;
        var json = resp.Content.ReadAsStringAsync().Result;
        var rootNode = JsonNode.Parse(json);
        if (rootNode is null) return result;

        // The /api/tree?root=... response is a single subtree object with a
        // top-level `children` array. /api/tree (no root) returns an array of
        // root subtrees. Handle both shapes defensively in case the route
        // contract drifts.
        JsonArray? children = null;
        if (rootNode is JsonArray topLevel)
        {
            // No root requested: top-level entries are the roots themselves.
            children = topLevel;
        }
        else if (rootNode is JsonObject obj && obj["children"] is JsonArray subtreeChildren)
        {
            children = subtreeChildren;
        }
        if (children is null) return result;

        foreach (var c in children)
        {
            if (c is null) continue;
            // Each child is a TreeNodeResponse - we need the full item to
            // populate fields, so resolve by id.
            var id = c["id"]?.GetValue<string>();
            if (string.IsNullOrEmpty(id)) continue;
            var item = GetItemById(id!, database);
            if (item is not null) result.Add(item);
        }
        return result;
    }

    public static bool ItemExists(string path)
    {
        var clean = StripDrive(path);
        var resp = _http.Value.GetAsync($"/api/items/by-path?path={Uri.EscapeDataString(clean)}").Result;
        return resp.IsSuccessStatusCode;
    }

    public static string PostJson(string urlPath, object body)
    {
        var json = JsonSerializer.Serialize(body);
        var req = new StringContent(json, Encoding.UTF8, "application/json");
        var resp = _http.Value.PostAsync(urlPath, req).Result;
        var responseText = resp.Content.ReadAsStringAsync().Result;
        if (!resp.IsSuccessStatusCode) {
            throw new HttpRequestException($"{(int)resp.StatusCode} {resp.StatusCode}: {responseText}");
        }
        return responseText;
    }

    public static string PutJson(string urlPath, object body)
    {
        var json = JsonSerializer.Serialize(body);
        var req = new StringContent(json, Encoding.UTF8, "application/json");
        var resp = _http.Value.PutAsync(urlPath, req).Result;
        var responseText = resp.Content.ReadAsStringAsync().Result;
        if (!resp.IsSuccessStatusCode) {
            throw new HttpRequestException($"{(int)resp.StatusCode} {resp.StatusCode}: {responseText}");
        }
        return responseText;
    }

    public static string Delete(string urlPath)
    {
        var resp = _http.Value.DeleteAsync(urlPath).Result;
        var responseText = resp.Content.ReadAsStringAsync().Result;
        if (!resp.IsSuccessStatusCode) {
            throw new HttpRequestException($"{(int)resp.StatusCode} {resp.StatusCode}: {responseText}");
        }
        return responseText;
    }

    /// <summary>
    /// Commit buffered fields to disk via PUT /api/items/:id. Same body
    /// shape Set-ItemField -Apply uses. Throws on non-2xx.
    /// </summary>
    public static string UpdateItemFields(string id, IReadOnlyDictionary<string, string> fields, string language, int version)
    {
        var body = new
        {
            fields = fields,
            language = language,
            version = version,
        };
        return PutJson($"/api/items/{id}", body);
    }

    /// <summary>
    /// Compute a dry-run mutation plan via POST /api/items/preview-update.
    /// Same body shape Set-ItemField (no -Apply) uses. Returns the raw
    /// plan JSON for the caller to wrap into a host-side diff frame.
    /// </summary>
    public static string PreviewUpdate(string id, IReadOnlyDictionary<string, string> fields, string language, int version)
    {
        var body = new
        {
            id = id,
            fields = fields,
            language = language,
            version = version,
        };
        return PostJson("/api/items/preview-update", body);
    }

    /// <summary>master:/sitecore/X -> /sitecore/X</summary>
    public static string StripDrive(string path)
    {
        var idx = path.IndexOf(":/", StringComparison.Ordinal);
        return idx >= 0 ? path.Substring(idx + 1) : path;
    }

    private static MockingbirdItem? DeserializeItem(string json, string database)
    {
        var node = JsonNode.Parse(json);
        return node is null ? null : NodeToItem(node, database);
    }

    /// <summary>
    /// Build a MockingbirdItem from a /api/items/:id or /api/items/by-path
    /// response (i.e. a fully-serialized item with sharedFields[] and
    /// languages[] arrays). The /api/tree response shape (id+name+path only)
    /// is intentionally NOT handled here - callers should resolve those by
    /// id via GetItemById to populate fields.
    /// </summary>
    private static MockingbirdItem? NodeToItem(JsonNode node, string database)
    {
        var item = new MockingbirdItem
        {
            ID = node["id"]?.GetValue<string>() ?? "",
            Name = node["name"]?.GetValue<string>() ?? "",
            TemplateID = node["template"]?.GetValue<string>() ?? "",
            Database = database,
        };
        var fullPath = node["path"]?.GetValue<string>() ?? "";
        item.Paths.FullPath = fullPath;
        if (string.IsNullOrEmpty(item.Name) && !string.IsNullOrEmpty(fullPath)) {
            var slash = fullPath.LastIndexOf('/');
            item.Name = slash < 0 ? fullPath : fullPath.Substring(slash + 1);
        }

        // sharedFields[]: each entry is { id, hint, value, ... }.
        if (node["sharedFields"] is JsonArray shared) {
            foreach (var f in shared) {
                if (f is null) continue;
                item.Fields.Add(
                    f["id"]?.GetValue<string>() ?? "",
                    f["hint"]?.GetValue<string>() ?? "",
                    f["value"]?.GetValue<string>() ?? "");
            }
        }
        // languages[].fields and languages[].versions[].fields.
        if (node["languages"] is JsonArray langs) {
            foreach (var lang in langs) {
                if (lang is null) continue;
                if (lang["fields"] is JsonArray uf) {
                    foreach (var f in uf) {
                        if (f is null) continue;
                        item.Fields.Add(
                            f["id"]?.GetValue<string>() ?? "",
                            f["hint"]?.GetValue<string>() ?? "",
                            f["value"]?.GetValue<string>() ?? "");
                    }
                }
                if (lang["versions"] is JsonArray versions) {
                    foreach (var v in versions) {
                        if (v?["fields"] is JsonArray vf) {
                            foreach (var f in vf) {
                                if (f is null) continue;
                                item.Fields.Add(
                                    f["id"]?.GetValue<string>() ?? "",
                                    f["hint"]?.GetValue<string>() ?? "",
                                    f["value"]?.GetValue<string>() ?? "");
                            }
                        }
                    }
                }
            }
        }
        return item;
    }
}
