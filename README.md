# Mi Espacio

Sitio estático (HTML + JavaScript). Todos los archivos van juntos en la raíz del repositorio, sin carpetas.

| Archivo | Qué es |
|---|---|
| index.html | Portada con resumen y respaldo total |
| organizador.html | Menú de Mi Organizador |
| cajas.html · compras.html · ahorros.html | Secciones del organizador |
| traslado.html · instituto.html | Estación (Instituto incluye Notas importantes) |
| malla.html | Malla Curricular |
| iconos.css | Iconos de línea (reemplazan a los emojis) |
| app.js · sw.js · manifest.webmanifest · _headers · iconos | Respaldo total, modo sin conexión e instalación |

Publicar: subir todos los archivos a GitHub y conectar el repositorio a Cloudflare Pages (sin comando de compilación, carpeta de salida en la raíz).


## Tema común
app.js aplica el mismo tema (claro/oscuro y los 11 temas de Instituto) en todas las páginas y agrega la barra inferior. Los botones de tema abren la ventana "Cambiar tema". `app_tema` y `estacion_tema` se mantienen iguales entre sí.


## Ventanas propias
`app.js` expone `MiEspacio.confirmar({titulo, texto, ok, cancelar, peligro})` (devuelve una promesa con true o false) y `MiEspacio.avisar(texto, titulo)`. Reemplazan a `confirm()` y `alert()`; abren en medio de la pantalla con botones de 44 px. En acciones peligrosas el foco empieza en "Cancelar". Ya se usan en Cajas; las demás páginas se van migrando.

## Cajas
- Tarjetas con la inicial de la caja cuando no tiene foto; menú de tres puntos con Editar, Etiqueta, Mover objetos y Eliminar.
- Mantener presionado un objeto (o "Mover objetos" del menú) abre la selección múltiple: mover a otra caja o eliminar varios.
- Etiqueta imprimible (media hoja). Orden por nombre, más objetos o última edición, guardado en `vista_cajas_orden`.
- Cada caja guarda `mod` (fecha de última edición); las cajas antiguas usan la fecha más reciente de sus objetos.
