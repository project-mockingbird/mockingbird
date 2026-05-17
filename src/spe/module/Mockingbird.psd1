# src/spe/module/Mockingbird.psd1
@{
    RootModule = 'Mockingbird.psm1'
    ModuleVersion = '0.1.0'
    GUID = '4cdf7f9a-9c87-4f1d-8b64-2e8c9a6e0f12'
    Author = 'Mockingbird'
    Description = 'Mockingbird SPE-flavored PowerShell module'
    PowerShellVersion = '7.0'
    FunctionsToExport = @(
        'Get-Item','Get-ChildItem','Get-ItemField','Set-ItemField',
        'New-Item','Remove-Item','Find-Item',
        'Get-ItemTemplate','Get-ItemReference','Get-ItemReferrer',
        'Get-MockingbirdApiUrl',
        'Clear-Host',
        # Out-of-scope, throw NotImplemented:
        'Publish-Item','Invoke-Workflow','Show-FieldEditor','Show-ListView',
        'Show-Confirm','Show-Input','Set-ItemAcl','Lock-Item','Initialize-SearchIndex'
    )
    CmdletsToExport = @()
    AliasesToExport = @()
}
