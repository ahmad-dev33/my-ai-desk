[CmdletBinding()]
param(
    [string]$BaseDomain = "unified.localhost",
    [string]$Scheme = "http",
    [string]$PortSuffix = ":8080"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

$dashboardOrigin = "${Scheme}://dashboard.${BaseDomain}${PortSuffix}"
$targets = @(
    "${Scheme}://flows.${BaseDomain}${PortSuffix}/sso/typebot.html",
    "${Scheme}://inbox.${BaseDomain}${PortSuffix}/sso/chatwoot.html"
)

foreach ($target in $targets) {
    try {
        $response = Invoke-WebRequest -Uri $target -Method Get -UseBasicParsing
    }
    catch {
        if ($null -eq $_.Exception.Response) {
            throw "Embedded SSO route is unreachable: ${target}. $($_.Exception.Message)"
        }

        $response = $_.Exception.Response
    }

    $xFrameOptions = [string]$response.Headers["X-Frame-Options"]
    if ($xFrameOptions -match "(?i)SAMEORIGIN|DENY") {
        throw "Embedded SSO route blocks the dashboard frame: ${target} (X-Frame-Options: ${xFrameOptions})"
    }

    $contentSecurityPolicy = [string]$response.Headers["Content-Security-Policy"]
    if ($contentSecurityPolicy -notmatch "(?i)frame-ancestors") {
        throw "Embedded SSO route has no frame-ancestors policy: ${target}"
    }

    if (-not $contentSecurityPolicy.Contains($dashboardOrigin)) {
        throw "Embedded SSO route does not allow ${dashboardOrigin}: ${target}"
    }

    $cacheControl = [string]$response.Headers["Cache-Control"]
    if ($cacheControl -notmatch "(?i)no-store") {
        throw "Embedded SSO route can retain a stale frame policy: ${target}"
    }

    Write-Host "PASS ${target}"
}

# Follow the Typebot sign-in flow far enough to validate the Keycloak response
# that Chromium renders inside the same iframe. Testing only the helper page is
# insufficient because the OAuth redirect can introduce a stricter frame policy.
$flowsOrigin = "${Scheme}://flows.${BaseDomain}${PortSuffix}"
$cookies = [System.Net.CookieContainer]::new()
$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$handler.CookieContainer = $cookies
$client = [System.Net.Http.HttpClient]::new($handler)

try {
    $csrfResponse = $client.GetAsync("${flowsOrigin}/api/auth/csrf").Result
    if (-not $csrfResponse.IsSuccessStatusCode) {
        throw "Unable to obtain Typebot CSRF token: HTTP $([int]$csrfResponse.StatusCode)"
    }

    $csrf = $csrfResponse.Content.ReadAsStringAsync().Result | ConvertFrom-Json
    $formValues = [System.Collections.Generic.List[System.Collections.Generic.KeyValuePair[string,string]]]::new()
    $formValues.Add([System.Collections.Generic.KeyValuePair[string,string]]::new('csrfToken', [string]$csrf.csrfToken))
    $formValues.Add([System.Collections.Generic.KeyValuePair[string,string]]::new('callbackUrl', "${flowsOrigin}/sso/complete.html"))
    $form = [System.Net.Http.FormUrlEncodedContent]::new($formValues)
    $signInResponse = $client.PostAsync("${flowsOrigin}/api/auth/signin/custom-oauth", $form).Result

    if ([int]$signInResponse.StatusCode -notin @(301, 302, 303, 307, 308)) {
        throw "Typebot OAuth did not redirect to Keycloak: HTTP $([int]$signInResponse.StatusCode)"
    }

    $authLocation = $signInResponse.Headers.Location
    if ($null -eq $authLocation -or $authLocation.Host -ne "auth.${BaseDomain}") {
        throw "Typebot OAuth redirected to an unexpected identity provider."
    }

    $authResponse = $client.GetAsync($authLocation).Result
    $authXFrameOptions = [string]($authResponse.Headers | Where-Object Key -eq 'X-Frame-Options' | ForEach-Object { $_.Value -join ',' })
    if ($authXFrameOptions -match "(?i)SAMEORIGIN|DENY") {
        throw "Keycloak blocks the embedded Typebot OAuth flow (X-Frame-Options: ${authXFrameOptions})"
    }

    $authCsp = [string]($authResponse.Headers | Where-Object Key -eq 'Content-Security-Policy' | ForEach-Object { $_.Value -join ',' })
    if ($authCsp -notmatch "(?i)frame-ancestors" -or -not $authCsp.Contains($dashboardOrigin)) {
        throw "Keycloak does not allow the configured dashboard origin: ${dashboardOrigin}"
    }

    Write-Host "PASS Typebot OAuth -> Keycloak frame policy"
}
finally {
    $client.Dispose()
    $handler.Dispose()
}
