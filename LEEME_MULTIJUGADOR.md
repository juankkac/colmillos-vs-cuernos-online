# Colmillos vs. Cuernos Online

Esta carpeta contiene dos versiones separadas:

- `cvc_prototipo.html`: juego local existente para dos personas en el mismo computador.
- `cvc_multijugador.html`: entrada del nuevo modo en línea.

## Estado actual

El servidor ya permite crear una sala privada, generar un código de cinco caracteres y conectar dos jugadores. La selección de equipos y el combate todavía deben conectarse al servidor.

## Configuración de Render

Render puede leer `render.yaml` y configurar automáticamente un servicio web gratuito con Node.js. El servidor usa el puerto entregado por Render y conexiones WebSocket seguras cuando está publicado.
