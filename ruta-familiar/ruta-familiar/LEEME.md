# Ruta Familiar: cómo publicarla

La app calcula casetas, distancia y tiempo de cualquier ruta de México con la API de Ruteo del INEGI. Para funcionar necesita estar en internet con tu token del INEGI guardado en el servidor. Estos pasos son gratis y toman unos 15 minutos.

## Lo que contiene esta carpeta

- `index.html`: la app que ven las familias.
- `api/buscar.js` y `api/ruta.js`: funciones del servidor que consultan al INEGI. Ocultan tu token para que nadie lo vea.
- `vehiculos.json`: catálogo de autos con su rendimiento oficial. Se llenará con el Catálogo de Rendimiento de Combustible 2026.
- `manifest.webmanifest`: permite instalar la app en la pantalla de inicio del celular.

## Paso 1. Sube la carpeta a GitHub

1. Crea una cuenta gratis en https://github.com si no tienes.
2. Arriba a la derecha toca **+** y luego **New repository**. Ponle de nombre `ruta-familiar` y toca **Create repository**.
3. En la página nueva toca **uploading an existing file**.
4. Arrastra **todo el contenido** de esta carpeta (incluida la carpeta `api`) y toca **Commit changes**.

## Paso 2. Publica en Vercel

1. Entra a https://vercel.com y elige **Continue with GitHub**.
2. Toca **Add New… → Project** y elige `ruta-familiar`.
3. Antes de publicar, abre **Environment Variables** y agrega:
   - Nombre: `INEGI_TOKEN`
   - Valor: tu token del INEGI (la clave de 36 caracteres que te llegó por correo)
4. Toca **Deploy**. En un minuto tendrás una dirección como `ruta-familiar.vercel.app`.

## Paso 3. Pruébala

1. Abre la dirección en tu celular.
2. Escribe "Villahermosa" en origen y elige una opción de la lista; haz lo mismo con el destino.
3. Toca **Calcular rutas**. Debes ver las rutas de cuota y libre con sus casetas.

Si aparece "Falta configurar INEGI_TOKEN", revisa el paso 2.3 y vuelve a publicar desde Vercel (**Deployments → Redeploy**).

## Para tener en cuenta

- El INEGI actualiza tarifas y caminos una vez al año (cada 15 de diciembre), así que algún precio puede diferir del vigente.
- Las condiciones del INEGI piden dar crédito al servicio; la app ya lo hace al pie de la página.
- Nunca pegues tu token dentro de `index.html` ni lo compartas: solo va en Vercel.
