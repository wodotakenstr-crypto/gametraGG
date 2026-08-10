param(
  [string]$SmtpUser,
  [string]$FromEmail,
  [string]$AdminEmail
)

Set-Location -LiteralPath $PSScriptRoot

if (-not $SmtpUser) {
  $SmtpUser = Read-Host "Usuario SMTP de Brevo (campo Login)"
}

if (-not $FromEmail) {
  $FromEmail = Read-Host "Correo remitente verificado en Brevo"
}

$smtpKey = Read-Host "Clave SMTP de Brevo" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($smtpKey)

try {
  $env:SMTP_HOST = "smtp-relay.sendinblue.com"
  $env:SMTP_PORT = "587"
  $env:SMTP_SECURE = "false"
  $env:SMTP_USER = $SmtpUser
  $env:SMTP_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $env:FROM_EMAIL = $FromEmail
  $env:ADMIN_EMAIL = $AdminEmail
  & "C:\Program Files\nodejs\node.exe" server.js
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
