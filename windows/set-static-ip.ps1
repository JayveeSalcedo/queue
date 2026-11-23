# Gives the queue server PC a fixed (static) IPv4 address, so the station links
# on phones, counters and the TV never change. Run as administrator by the installer.
#
#   -Detect                         print the current network settings as JSON
#   -Apply -Ip -Prefix -Gateway     make the address fixed ( -Dns, -InterfaceIndex optional )
#   -Undo                           go back to automatic (DHCP)
#
# Only the connection that has the router (default gateway) is changed.
# Exit code 0 = ok, 1 = failed (the reason is written to the output).
param(
    [switch]$Detect,
    [switch]$Apply,
    [switch]$Undo,
    [string]$Ip,
    [int]$Prefix = 24,
    [string]$Gateway,
    [string[]]$Dns,
    [int]$InterfaceIndex = 0,
    [switch]$Lines,          # with -Detect: key=value lines instead of JSON (the installer reads these)
    [string]$OutFile         # also write the result/message to this file (the installer reads it)
)
$ErrorActionPreference = 'Stop'

$dataDir    = Join-Path $env:ProgramData 'QueueSystem'
$beforeFile = Join-Path $dataDir 'network-before.json'
$fixedFile  = Join-Path $dataDir 'fixed-ip.json'
$virtual    = 'Virtual|VMware|VirtualBox|Hyper-V|Loopback|TAP|WireGuard'

function Say {
    param([string]$Text)
    Write-Output $Text
    if ($OutFile) { Set-Content -Path $OutFile -Value $Text -Encoding ASCII }
}

function Get-MainConnection {
    param([int]$Index)
    $all = @(Get-NetIPConfiguration | Where-Object {
        $_.IPv4Address -and $_.NetAdapter.Status -eq 'Up' -and $_.InterfaceDescription -notmatch $virtual
    })
    if ($Index -gt 0) { return ($all | Where-Object { $_.InterfaceIndex -eq $Index } | Select-Object -First 1) }
    $withRouter = $all | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1
    if ($withRouter) { return $withRouter }
    return ($all | Select-Object -First 1)
}

function Get-Settings {
    param($Conn)
    $addr = $Conn.IPv4Address | Where-Object { $_.IPAddress -notlike '169.254*' } | Select-Object -First 1
    $dhcp = (Get-NetIPInterface -InterfaceIndex $Conn.InterfaceIndex -AddressFamily IPv4).Dhcp -eq 'Enabled'
    $dns  = @((Get-DnsClientServerAddress -InterfaceIndex $Conn.InterfaceIndex -AddressFamily IPv4).ServerAddresses)
    [ordered]@{
        adapter         = $Conn.InterfaceAlias
        interface_index = [int]$Conn.InterfaceIndex
        ip              = $addr.IPAddress
        prefix          = [int]$addr.PrefixLength
        gateway         = if ($Conn.IPv4DefaultGateway) { $Conn.IPv4DefaultGateway.NextHop } else { '' }
        dns             = $dns
        dhcp            = $dhcp
    }
}

function Test-InSubnet {
    param([string]$A, [string]$B, [int]$Bits)
    $x = [System.Net.IPAddress]::Parse($A).GetAddressBytes()
    $y = [System.Net.IPAddress]::Parse($B).GetAddressBytes()
    [Array]::Reverse($x); [Array]::Reverse($y)
    $mask = if ($Bits -le 0) { [uint32]0 } else { [uint32]([uint32]::MaxValue -shl (32 - $Bits)) }
    (([BitConverter]::ToUInt32($x, 0)) -band $mask) -eq (([BitConverter]::ToUInt32($y, 0)) -band $mask)
}

try {
    if ($Detect) {
        $conn = Get-MainConnection -Index $InterfaceIndex
        if (-not $conn) { Say ($(if ($Lines) { 'found=0' } else { '{}' })); exit 0 }
        $s = Get-Settings $conn
        if ($Lines) {
            Say ((@(
                'found=1', "adapter=$($s.adapter)", "interface_index=$($s.interface_index)", "ip=$($s.ip)",
                "prefix=$($s.prefix)", "gateway=$($s.gateway)", "dns=$($s.dns -join ',')", "dhcp=$([int]$s.dhcp)"
            )) -join "`n")
        } else {
            Say ($s | ConvertTo-Json -Compress)
        }
        exit 0
    }

    if ($Undo) {
        if (-not (Test-Path $beforeFile)) { Say 'Nothing to undo: no saved network settings were found.'; exit 1 }
        $old = Get-Content $beforeFile -Raw | ConvertFrom-Json
        $idx = [int]$old.interface_index
        Set-NetIPInterface -InterfaceIndex $idx -AddressFamily IPv4 -Dhcp Enabled
        Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.PrefixOrigin -eq 'Manual' } | Remove-NetIPAddress -Confirm:$false -ErrorAction SilentlyContinue
        Get-NetRoute -InterfaceIndex $idx -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
            Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue
        Set-DnsClientServerAddress -InterfaceIndex $idx -ResetServerAddresses
        Remove-Item $fixedFile -ErrorAction SilentlyContinue
        Say 'Network set back to automatic (DHCP).'
        exit 0
    }

    if ($Apply) {
        $conn = Get-MainConnection -Index $InterfaceIndex
        if (-not $conn) { Say 'No active network connection was found.'; exit 1 }
        $cur = Get-Settings $conn

        $parsed = $null
        if (-not [System.Net.IPAddress]::TryParse($Ip, [ref]$parsed) -or $parsed.AddressFamily -ne 'InterNetwork') {
            Say "'$Ip' is not a valid IPv4 address."; exit 1
        }
        if ($Prefix -lt 8 -or $Prefix -gt 30) { Say "The subnet size /$Prefix is not valid."; exit 1 }
        if (-not $Gateway) { $Gateway = $cur.gateway }
        if ($Gateway -and -not (Test-InSubnet $Ip $Gateway $Prefix)) {
            Say "The address $Ip and the router $Gateway are not on the same network."; exit 1
        }
        # The installer passes several DNS servers as one comma-separated value
        $Dns = @($Dns | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
        if (-not $Dns -or $Dns.Count -eq 0) { $Dns = if ($cur.dns.Count) { $cur.dns } elseif ($Gateway) { @($Gateway) } else { @() } }

        # A different address must not already be in use by another device
        if ($Ip -ne $cur.ip -and (Test-Connection -ComputerName $Ip -Count 2 -Quiet)) {
            Say "Another device on the network already answers at $Ip. Choose a different address."; exit 1
        }

        # Remember how it was, so it can be undone. Never overwrite the very first copy
        # with an already-fixed setup (a repeat install would otherwise lose the original).
        New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
        if ($cur.dhcp -or -not (Test-Path $beforeFile)) { $cur | ConvertTo-Json -Compress | Set-Content $beforeFile -Encoding UTF8 }

        $idx = [int]$conn.InterfaceIndex
        if ($cur.ip -eq $Ip -and $cur.prefix -eq $Prefix -and -not $cur.dhcp -and $cur.gateway -eq $Gateway) {
            # Already exactly this: nothing to change
        } else {
            Set-NetIPInterface -InterfaceIndex $idx -AddressFamily IPv4 -Dhcp Disabled
            Get-NetRoute -InterfaceIndex $idx -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
                Remove-NetRoute -Confirm:$false -ErrorAction SilentlyContinue
            Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                Where-Object { $_.IPAddress -notlike '169.254*' } | Remove-NetIPAddress -Confirm:$false -ErrorAction SilentlyContinue
            $args2 = @{ InterfaceIndex = $idx; IPAddress = $Ip; PrefixLength = $Prefix; AddressFamily = 'IPv4' }
            if ($Gateway) { $args2.DefaultGateway = $Gateway }
            New-NetIPAddress @args2 | Out-Null
        }
        if ($Dns.Count) { Set-DnsClientServerAddress -InterfaceIndex $idx -ServerAddresses $Dns }

        # Check it really stuck
        Start-Sleep -Seconds 2
        $check = Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -eq $Ip }
        $dhcpOff = (Get-NetIPInterface -InterfaceIndex $idx -AddressFamily IPv4).Dhcp -eq 'Disabled'
        if (-not $check -or -not $dhcpOff) { Say "The fixed address could not be applied to $($conn.InterfaceAlias)."; exit 1 }

        [ordered]@{ ip = $Ip; adapter = $conn.InterfaceAlias; set_at = (Get-Date).ToString('s') } |
            ConvertTo-Json -Compress | Set-Content $fixedFile -Encoding UTF8
        Say "Fixed address $Ip set on $($conn.InterfaceAlias)."
        exit 0
    }

    Say 'Use -Detect, -Apply or -Undo.'
    exit 1
}
catch {
    Say $_.Exception.Message
    exit 1
}
