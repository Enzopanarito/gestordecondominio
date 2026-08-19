# VLA · Runbook de contingencia independiente

## 0. Regla principal
El failover no es una segunda producción permanente. Es una infraestructura de contingencia que permanece en modo seguro hasta que Netlify no pueda prestar el servicio y se autorice una conmutación.

Nunca ejecutar cierre mensual, WhatsApp programado ni schedulers duplicados desde este failover v1.

## 1. Identidad certificada
- Fuente VLA: `Enzopanarito/portaldelpropietario`
- Commit fijado: `6d2b9d05fc3e7f69361d11dbb00988e9c97f4c25`
- Release: `2026-08-15-v13`
- Producción Airtable: `app4nE4ReGRi2SuP2`
- Staging ficticio: `appZhq8nVZ7lZ2k6K`
- Casas esperadas: 15

Antes de cualquier activación, `failover-health` debe mostrar exactamente ese commit/release.

## 2. Modos

### disabled
Modo predeterminado. Permite lectura contra la base declarada, pero cualquier handler clasificado como escritura responde fail-closed.

### staging
Solo puede operar contra `appZhq8nVZ7lZ2k6K`. Se usa para la certificación funcional y pruebas destructivas con datos ficticios.

### active
Solo para una contingencia real. Requiere simultáneamente:
1. `VLA_DATA_ENVIRONMENT=production`
2. `AIRTABLE_BASE_ID=app4nE4ReGRi2SuP2`
3. `VLA_FAILOVER_WRITE_MODE=active`
4. `VERCEL_ENV=production`
5. `VLA_FAILOVER_ACTIVATION_FINGERPRINT` exactamente igual a la huella derivada del source-lock.

La huella se obtiene dentro de una copia del repo con:

```bash
node -e "console.log(require('./lib/failover-guard.cjs').activationFingerprint())"
```

No se trata como contraseña. Es una barrera contra activación accidental. Los secretos reales siguen siendo Airtable, Admin, cifrado, Blob, SMTP y MKJ.

## 3. Creación inicial del proyecto Vercel

Nombre reservado recomendado: `villa-los-apamates-backup`.

Conectar exclusivamente el repositorio `Enzopanarito/gestordecondominio` y desplegar inicialmente la rama `failover/vla-standalone-2026-08-19`.

Configuración inicial:
- Framework preset: Other / sin framework.
- Root directory: raíz del repositorio.
- Build command: `npm run build` (también está fijado en `vercel.json`).
- Output directory: `dist`.
- Node: 24.x.

Crear un Vercel Blob privado dedicado al proyecto. No reutilizar almacenamiento de SEINCA ni del lector Gemini.

## 4. Variables para STAGING

Configurar únicamente en el entorno usado para la certificación:

```text
VLA_DATA_ENVIRONMENT=staging
VLA_FAILOVER_WRITE_MODE=disabled
AIRTABLE_BASE_ID=appZhq8nVZ7lZ2k6K
AIRTABLE_API_TOKEN=<token con acceso a staging>
ADMIN_PASSWORD=<contraseña de prueba>
ADMIN_TOKEN_SECRET=<secreto exclusivo del failover staging>
PAYMENT_PROOF_ENCRYPTION_KEY=<clave exclusiva staging>
BLOB_READ_WRITE_TOKEN=<token del Blob privado dedicado>
PUBLIC_SITE_URL=<URL Vercel del failover>
URL=<URL Vercel del failover>
```

No cargar inicialmente credenciales SMTP reales ni credenciales MKJ reales. Para pruebas de recibos/acceso se debe usar una estrategia explícitamente segura antes de habilitar esos caminos.

## 5. Gates de certificación STAGING

Con `VLA_FAILOVER_WRITE_MODE=disabled`:
- `/api/failover-health` HTTP 200.
- source commit/release exactos.
- portal propietario carga sin Netlify.
- Admin carga sin Edge Functions Netlify.
- `public-data` devuelve 15/15 casas ficticias.
- login funciona.
- endpoints de escritura devuelven bloqueo fail-closed.
- cualquier ruta `monthly-close*` devuelve bloqueo explícito.
- cualquier ruta `whatsapp*` devuelve bloqueo explícito.

Después cambiar únicamente STAGING a `VLA_FAILOVER_WRITE_MODE=staging` y ejecutar la matriz transaccional sobre datos ficticios:
1. crear/revisar reporte de pago;
2. detectar duplicado;
3. aprobar;
4. rechazar otro reporte;
5. corregir/revisión por excepción;
6. pago manual;
7. comprobar efecto contable esperado;
8. comprobar preservación USD/Bs sin compensación cruzada;
9. recibo sin envío real externo no autorizado;
10. acceso en modo seguro, sin tocar la organización MKJ real.

Antes y después de la matriz guardar snapshot de las 15 casas STAGING y reconciliar cada cambio con las operaciones ficticias ejecutadas.

## 6. Requisitos antes de ACTIVE

No habilitar producción hasta que todos sean verdaderos:
- CI del repo failover verde.
- build Vercel verde.
- health verde.
- matriz STAGING verde.
- 100 ciclos deterministas locales/CI verdes.
- URL de contingencia estable.
- comprobación explícita de que Netlify producción sigue intacto.
- snapshot financiero de producción capturado en solo lectura.
- cierre mensual y WhatsApp siguen bloqueados en failover.
- decisión administrativa de activar contingencia.

## 7. Activación real

La activación debe ser deliberada y breve:
1. Confirmar que Netlify realmente no presta el servicio o que existe una razón documentada para conmutar.
2. Capturar baseline financiero de producción antes de activar escrituras.
3. Configurar en Vercel Production las variables reales necesarias, nunca en Preview.
4. Cambiar `VLA_DATA_ENVIRONMENT=production`.
5. Confirmar `AIRTABLE_BASE_ID=app4nE4ReGRi2SuP2`.
6. Cambiar `VLA_FAILOVER_WRITE_MODE=active`.
7. Añadir la huella exacta `VLA_FAILOVER_ACTIVATION_FINGERPRINT`.
8. Validar `/api/failover-health`: `writeActive=true`.
9. Probar primero lectura y login.
10. Habilitar/usar únicamente las operaciones necesarias para mantener el condominio funcionando.

No ejecutar cierre mensual desde el failover v1 aunque la contingencia coincida con días 1–3. Ese evento requiere un procedimiento específico separado.

## 8. Retorno a Netlify

Cuando Netlify vuelva a estar operativo:
1. congelar nuevas escrituras del failover cambiando `VLA_FAILOVER_WRITE_MODE=disabled`;
2. esperar a que no haya operaciones de pago en curso;
3. comparar saldos/operaciones contra Airtable, que sigue siendo la fuente compartida;
4. verificar Netlify contra el mismo estado financiero;
5. confirmar reportes/pagos/recibos sin estados parciales;
6. volver el tráfico al portal principal;
7. mantener Vercel en `disabled`;
8. documentar inicio, fin y operaciones ejecutadas durante contingencia.

Como ambos entornos usan la misma fuente de datos en una contingencia real, no debe existir una “migración de saldos” al regresar. El control es reconciliación, no copia de cifras.

## 9. Prohibiciones
- No reutilizar `gemini-proxy-seinca`.
- No poner producción Airtable en modo `staging`.
- No ejecutar schedulers duplicados.
- No habilitar WhatsApp desde Vercel.
- No ejecutar cierre mensual desde Vercel v1.
- No apuntar pruebas destructivas a `app4nE4ReGRi2SuP2`.
- No considerar el Punto 2 certificado solo porque la página abre.
