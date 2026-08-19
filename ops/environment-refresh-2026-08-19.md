# VLA Failover · Environment refresh

Documento de control para el redeploy posterior a la carga de `AIRTABLE_API_TOKEN` en Vercel.

- Proyecto: `vla-failover`
- Entorno por defecto: `staging`
- Base STAGING autorizada: `appZhq8nVZ7lZ2k6K`
- Escrituras por defecto: `disabled`
- Motivo: forzar un nuevo runtime de Vercel que cargue la variable sensible recién configurada.
- No modifica lógica financiera, pagos, acceso, WhatsApp ni cierre mensual.
- No toca Netlify producción.

El failover debe seguir fallando cerrado ante cualquier combinación de entorno/base/modo que no coincida con sus guardrails.
