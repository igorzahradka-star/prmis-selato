# Souhlas s oprávněním Mail.Send (delegované) pro SharePoint Framework — pro aplikaci PRM Revoltum.
# Spouští administrátor tenantu (role Global Administrator nebo Privileged Role Administrator) v PowerShellu.
# Potřebuje modul Microsoft.Graph.Authentication a Microsoft.Graph.Applications
#   (Install-Module Microsoft.Graph -Scope CurrentUser, pokud chybí).
#
# Co skript dělá: najde sdílenou aplikaci "SharePoint Online Client Extensibility Web Application Principal",
# zjistí její stávající souhlasy pro Microsoft Graph a DOPLNÍ k nim Mail.Send. Nic stávajícího nepřepisuje ani nemaže.
# Souhlas je delegovaný: aplikace smí odesílat poštu jen jménem právě přihlášeného uživatele.
# Pozor: souhlas se uděluje sdílené aplikaci, takže ho technicky využije každé SPFx řešení v tenantu.

Connect-MgGraph -Scopes "DelegatedPermissionGrant.ReadWrite.All", "Application.Read.All"

$client = Get-MgServicePrincipal -Filter "displayName eq 'SharePoint Online Client Extensibility Web Application Principal'"
$graph = Get-MgServicePrincipal -Filter "appId eq '00000003-0000-0000-c000-000000000000'"
if (-not $client -or -not $graph) {
    Write-Host "Nenalezena aplikace SharePoint Online Client Extensibility Web Application Principal nebo Microsoft Graph." -ForegroundColor Red
    return
}

$grants = @(Get-MgOauth2PermissionGrant -Filter "clientId eq '$($client.Id)' and resourceId eq '$($graph.Id)'")
Write-Host "Stávající souhlasy pro Microsoft Graph:"
$grants | Format-Table Id, ConsentType, Scope -AutoSize

$all = $grants | Where-Object { $_.ConsentType -eq 'AllPrincipals' } | Select-Object -First 1
if ($all) {
    $scopes = @($all.Scope -split ' ' | Where-Object { $_ })
    if ($scopes -contains 'Mail.Send') {
        Write-Host "Mail.Send už je udělený. Další krok: uživatelé se odhlásí a znovu přihlásí." -ForegroundColor Green
    } else {
        $new = (($scopes + 'Mail.Send') | Select-Object -Unique) -join ' '
        Update-MgOauth2PermissionGrant -OAuth2PermissionGrantId $all.Id -Scope $new
        Write-Host "Mail.Send doplněn. Nový rozsah: $new" -ForegroundColor Green
    }
} else {
    New-MgOauth2PermissionGrant -ClientId $client.Id -ConsentType AllPrincipals -ResourceId $graph.Id -Scope "Mail.Send" | Out-Null
    Write-Host "Vytvořen nový souhlas s Mail.Send." -ForegroundColor Green
}
