# VLA · Failover operativo independiente · alcance v1

## Objetivo
Mantener operativo el núcleo de Villa Los Apamates si Netlify queda indisponible, sin crear una segunda lógica financiera y sin tocar producción durante las pruebas.

## Fuente de verdad
- Código: `Enzopanarito/portaldelpropietario` fijado por `vla-source-lock.json`.
- Staging: Airtable `Villas Los Apamates — STAGING (DATOS FICTICIOS)`.
- Producción: permanece en Netlify mientras este failover no sea activado formalmente.
- La lógica financiera no se reimplementa: se reutilizan los handlers y módulos compartidos del commit fijado.

## Superficies operativas incluidas
1. Portal propietario y lectura de saldos.
2. Login administrativo y lectura Admin.
3. Reporte de pago y seguimiento del reporte.
4. Lectura de comprobantes y complemento.
5. Aprobación, aprobación por excepción, corrección y rechazo de reportes.
6. Pago manual administrativo.
7. Emisión/reenvío de recibos.
8. BCV requerido por los flujos de pago.
9. Lectura de estado de acceso y operaciones MKJ necesarias durante contingencia.
10. Salud específica del failover.

## Exclusiones intencionales v1
- WhatsApp: sigue siendo un runtime externo separado; no se migra, modifica ni duplica.
- Cierre mensual real: bloqueado expresamente en el failover v1. Debe ejecutarse únicamente desde la autoridad certificada del cierre o tras una certificación específica posterior.
- Backups y tareas programadas Netlify: no se duplican en v1 para evitar doble ejecución.
- Limpieza de código legacy: no forma parte de este punto.

## Guardas de escritura
- El modo predeterminado es `disabled`.
- `staging`: permite escrituras únicamente si `AIRTABLE_BASE_ID` coincide exactamente con `appZhq8nVZ7lZ2k6K`.
- `active`: se reservará para contingencia real y exige una activación explícita por variables seguras; nunca se usa en CI.
- Si la configuración no es inequívoca, el backend falla cerrado.

## Almacenamiento
Los módulos VLA que usan Netlify Blobs reciben un adaptador de compatibilidad sobre Vercel Blob privado. La semántica de lectura, ETag, escritura condicional e idempotencia se conserva en un único objeto lógico por clave.

## Criterio de certificación del Punto 2
No se considera terminado hasta cumplir todo:
- build reproducible desde el SHA fijado;
- 100 ciclos deterministas del contrato de failover;
- matriz funcional sobre staging sin tocar producción;
- despliegue Vercel independiente;
- URL de contingencia comprobada;
- lectura de 15/15 casas;
- login;
- reporte de pago;
- pago manual;
- aprobar/rechazar;
- recibos;
- acceso;
- prueba de que WhatsApp y cierre mensual no se duplican;
- procedimiento de activación y retorno documentado.
