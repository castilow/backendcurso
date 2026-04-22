#!/bin/bash
# Configura Supabase Auth para brokerdecoches (Site URL, redirect URLs,
# plantilla email "Invite user" en español).
#
# Uso:
#   export SUPABASE_ACCESS_TOKEN=sbp_xxxx          # PAT de Management API
#   bash scripts/configureSupabaseAuth.sh
#
# Idempotente: se puede correr varias veces.

set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-fgawbfgtyvenknnhtpox}"
TOKEN="${SUPABASE_ACCESS_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "Falta SUPABASE_ACCESS_TOKEN. Ejecuta:"
  echo "  export SUPABASE_ACCESS_TOKEN=sbp_xxxx"
  echo "  bash scripts/configureSupabaseAuth.sh"
  exit 1
fi

SITE_URL="https://home.brokerdecoches.com"
REDIRECT_LIST="https://home.brokerdecoches.com/**,https://home.brokerdecoches.com,http://localhost:3000/**,http://localhost:3000"

SUBJECT="Accede a tu cuenta de Broker de Coches"

# HTML en una línea (JSON no admite saltos literales). Uso comillas simples
# para atributos HTML y así no escapar dobles dentro del JSON.
HTML="<h2>¡Bienvenido a Broker de Coches!</h2><p>Hola,</p><p>Hemos recibido tu pago correctamente. Para empezar a usar tu cuenta, configura tu contraseña haciendo clic en el botón:</p><p style='text-align:center;'><a href='{{ .ConfirmationURL }}' style='background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;'>Configurar mi contraseña</a></p><p>Una vez configurada, podrás iniciar sesión en <a href='https://home.brokerdecoches.com'>home.brokerdecoches.com</a> con tu email y la contraseña que acabas de elegir.</p><p>Si no reconoces este pago, ignora este email.</p><p>Un saludo,<br>El equipo de Broker de Coches</p>"

# Construyo el JSON con python (escape seguro de strings):
BODY=$(python3 - <<PY
import json
print(json.dumps({
  "site_url": "$SITE_URL",
  "uri_allow_list": "$REDIRECT_LIST",
  "mailer_subjects_invite": "$SUBJECT",
  "mailer_templates_invite_content": """$HTML"""
}))
PY
)

echo "→ PATCH /v1/projects/$PROJECT_REF/config/auth"
RESPONSE=$(curl -sS -w "\nHTTP %{http_code}" -X PATCH \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$BODY")

echo "$RESPONSE"

# Re-lectura para confirmar:
echo ""
echo "→ GET /v1/projects/$PROJECT_REF/config/auth (confirmación)"
curl -sS -X GET \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $TOKEN" |
  python3 -c "import json,sys; c=json.load(sys.stdin); print('  site_url       :', c.get('site_url')); print('  uri_allow_list :', c.get('uri_allow_list')); print('  invite subject :', c.get('mailer_subjects_invite')); print('  invite content :', (c.get('mailer_templates_invite_content') or '')[:120]+'...')"

echo ""
echo "✅ Supabase Auth configurado."
