// src/spe/provider-csharp/Mockingbird.Provider/MockingbirdItemProvider.cs
using System.Collections.ObjectModel;
using System.Management.Automation;
using System.Management.Automation.Provider;

namespace Mockingbird.Provider;

[CmdletProvider("Mockingbird", ProviderCapabilities.None)]
public class MockingbirdItemProvider : NavigationCmdletProvider
{
    protected override Collection<PSDriveInfo> InitializeDefaultDrives()
    {
        // Root is "/" so that `master:/sitecore/X` resolves to absolute path
        // "/sitecore/X" rather than concatenating against the drive root and
        // landing on "/sitecore/sitecore/X". PSDriveInfo.Root is prepended to
        // any path that is not already drive-rooted, so a literal "/" gives
        // us a no-op prefix.
        var drives = new Collection<PSDriveInfo>();
        foreach (var name in new[] { "master", "core", "web" })
        {
            drives.Add(new PSDriveInfo(name, ProviderInfo, "/", $"Mockingbird {name} database", PSCredential.Empty));
        }
        return drives;
    }

    /// <summary>
    /// True if the path is the synthetic drive root ("/" or empty) - PowerShell
    /// asks about this when validating Set-Location master: and the drive's own
    /// root. Real items don't have to back the drive root.
    /// </summary>
    private static bool IsDriveRoot(string path)
        => string.IsNullOrEmpty(path) || path == "/" || path == "\\";

    protected override bool IsItemContainer(string path)
    {
        // SCS YAML allows any item to have children, so every Mockingbird path
        // is potentially a container. Returning true unconditionally avoids an
        // HTTP round-trip per path during deep recursion (Get-ChildItem -Recurse
        // calls IsItemContainer once per leaf). ItemExists() is the right place
        // for existence checks; non-existent paths still return [] from
        // GetChildItems and don't recurse meaningfully.
        return true;
    }

    protected override bool ItemExists(string path)
    {
        if (IsDriveRoot(path)) return true;
        return ApiClient.ItemExists(path);
    }

    protected override void GetItem(string path)
    {
        if (IsDriveRoot(path))
        {
            // Synthetic drive-root item; named after the database so prompt and
            // Get-Location output read sensibly.
            var root = new MockingbirdItem { Name = DriveName(), Database = DriveName(), TemplateName = "DriveRoot" };
            root.Paths.FullPath = "/";
            WriteItemObject(root, path, isContainer: true);
            return;
        }
        var item = ApiClient.GetItemByPath(path, DriveName());
        if (item is not null) WriteItemObject(item, path, isContainer: true);
    }

    protected override void GetChildItems(string path, bool recurse)
    {
        WalkChildren(path, recurse);
    }

    protected override bool HasChildItems(string path)
    {
        var children = ApiClient.GetChildren(path, DriveName());
        return children.Count > 0;
    }

    private void WalkChildren(string path, bool recurse)
    {
        var children = ApiClient.GetChildren(path, DriveName());
        foreach (var child in children)
        {
            WriteItemObject(child, child.Paths.FullPath, isContainer: true);
            if (recurse)
            {
                WalkChildren(child.Paths.FullPath, true);
            }
        }
    }

    private string DriveName() => PSDriveInfo?.Name ?? "master";

    /// <summary>
    /// PowerShell calls into this for path normalization. Mockingbird paths are
    /// always forward-slash absolute starting with /sitecore. Treat / as separator.
    /// </summary>
    protected override bool IsValidPath(string path) => true;

    protected override string MakePath(string parent, string child)
    {
        if (string.IsNullOrEmpty(parent)) return child;
        if (string.IsNullOrEmpty(child)) return parent;
        return parent.TrimEnd('/') + "/" + child.TrimStart('/');
    }

    protected override string GetChildName(string path)
    {
        var idx = path.LastIndexOf('/');
        return idx < 0 ? path : path.Substring(idx + 1);
    }

    protected override string GetParentPath(string path, string root)
    {
        // The drive root has no parent - returning anything else makes PowerShell
        // try to navigate "/.." and bail with "outside the base" when the user
        // does Set-Location master:.
        if (IsDriveRoot(path)) return "";
        var idx = path.LastIndexOf('/');
        if (idx <= 0) return "/";
        return path.Substring(0, idx);
    }
}
