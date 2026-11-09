# Prozkoumání struktury složek SELATO (jen čtení)
#
# Co dělá: projde disk SELATO a zapíše NÁZVY složek do dvou textových souborů.
# Co nedělá: nic nemění, nemaže, nekopíruje, nečte obsah souborů, nepracuje s hesly.
#
# Spuštění (v PowerShellu, kde je disk O:\ vidět):
#   .\prozkoumej-selato.ps1
# Jiný disk nebo hloubka:
#   .\prozkoumej-selato.ps1 -Koren "O:\" -Hloubka 3
#
# Výsledek (ve stejné složce jako skript):
#   selato-strom.txt   strom složek do zadané hloubky, u každé složky počet podsložek a souborů
#   selato-prvni-uroven.txt   názvy složek přímo v kořeni (z nich poznám číslování)

param(
    [string]$Koren = 'O:\',
    [int]$Hloubka = 3,
    [int]$MaxNaUrovni = 300
)

$ErrorActionPreference = 'SilentlyContinue'
$vystup = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$souborStrom = Join-Path $vystup 'selato-strom.txt'
$souborPrvni = Join-Path $vystup 'selato-prvni-uroven.txt'

if (-not (Test-Path -LiteralPath $Koren)) {
    Write-Host "Cesta $Koren neexistuje. Zkontroluj, že je disk připojený (spusť svůj .bat)." -ForegroundColor Red
    exit 1
}

$radky = New-Object System.Collections.Generic.List[string]
$radky.Add("Kořen: $Koren   hloubka: $Hloubka   vytvořeno: $(Get-Date -Format 'yyyy-MM-dd HH:mm')")
$radky.Add('')

function Projdi([string]$cesta, [int]$uroven) {
    $slozky = @(Get-ChildItem -LiteralPath $cesta -Directory -Force | Sort-Object Name)
    $zobrazit = $slozky | Select-Object -First $MaxNaUrovni
    foreach ($s in $zobrazit) {
        $pod = @(Get-ChildItem -LiteralPath $s.FullName -Directory -Force).Count
        $soub = @(Get-ChildItem -LiteralPath $s.FullName -File -Force).Count
        $odsazeni = '  ' * $uroven
        $radky.Add("$odsazeni$($s.Name)   [podsložek: $pod, souborů: $soub]")
        if ($uroven + 1 -lt $Hloubka) {
            Projdi $s.FullName ($uroven + 1)
        }
    }
    if ($slozky.Count -gt $MaxNaUrovni) {
        $radky.Add(('  ' * $uroven) + "... a dalších $($slozky.Count - $MaxNaUrovni) složek (zkráceno)")
    }
}

Write-Host "Čtu strukturu $Koren (může to chvíli trvat)..."
Projdi $Koren 0
$radky | Set-Content -LiteralPath $souborStrom -Encoding UTF8

Get-ChildItem -LiteralPath $Koren -Directory -Force | Sort-Object Name |
    ForEach-Object { $_.Name } |
    Set-Content -LiteralPath $souborPrvni -Encoding UTF8

Write-Host "Hotovo. Vznikly soubory:" -ForegroundColor Green
Write-Host "  $souborStrom"
Write-Host "  $souborPrvni"
Write-Host "Zkontroluj je (obsahují názvy složek, tedy i názvy zákazníků) a pošli mi je."
