// src/spe/provider-csharp/Mockingbird.Provider/MockingbirdItem.cs
namespace Mockingbird.Provider;

public class MockingbirdItemPaths
{
    public string FullPath { get; set; } = "";
    public string Path => FullPath; // SPE compatibility alias
    public string ParentPath
    {
        get
        {
            var idx = FullPath.LastIndexOf('/');
            return idx <= 0 ? "/sitecore" : FullPath.Substring(0, idx);
        }
    }
}

public class MockingbirdItem
{
    public string Name { get; set; } = "";
    public string ID { get; set; } = "";
    public string TemplateID { get; set; } = "";
    public string TemplateName { get; set; } = "";
    public string Database { get; set; } = "master";
    public string Language { get; set; } = "en";
    /// <summary>
    /// Version number on the loaded item. Defaults to 1 - the field is wired
    /// through to PUT /api/items/:id by Editing.EndEdit so users authoring
    /// against a non-1 version can override before BeginEdit.
    /// </summary>
    public int Version { get; set; } = 1;
    public MockingbirdItemPaths Paths { get; } = new();
    public MockingbirdFieldCollection Fields { get; }
    public MockingbirdEditContext Editing { get; }

    public MockingbirdItem()
    {
        Fields = new MockingbirdFieldCollection();
        Editing = new MockingbirdEditContext(this);
        Fields.AttachEditContext(Editing);
    }

    /// <summary>
    /// PowerShell indexer: <c>$item["FieldName"]</c> returns field value
    /// (getter); <c>$item["FieldName"] = "x"</c> buffers the assignment
    /// in <see cref="Editing"/> (setter), which throws unless BeginEdit
    /// was called.
    /// </summary>
    public string? this[string fieldName]
    {
        get => Fields[fieldName];
        set => Fields[fieldName] = value ?? "";
    }

    public override string ToString() => Paths.FullPath;
}
