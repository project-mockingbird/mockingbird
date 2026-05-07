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
    public MockingbirdItemPaths Paths { get; } = new();
    public MockingbirdFieldCollection Fields { get; } = new();

    /// <summary>
    /// PowerShell indexer: <c>$item["FieldName"]</c> returns field value.
    /// </summary>
    public string? this[string fieldName] => Fields[fieldName];

    public override string ToString() => Paths.FullPath;
}
