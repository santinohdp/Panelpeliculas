# Backend Películas y Series (VOD/Series)

Backend independiente en Node.js + Express + SQLite (`node:sqlite`, sin dependencias
nativas que compilar) con panel administrativo y API pública estilo **Xtream Codes**,
pero enfocado **solo** en Películas (VOD) y Series — sin nada de TV en vivo.
Listo para desplegar gratis en Render.com.

## Estructura

```
vod-backend/
├── server.js                 # punto de entrada
├── database.js                # conexión SQLite, esquema y seed del admin
├── middleware/
│   └── auth.js                 # JWT para proteger el panel admin
├── routes/
│   ├── publicApi.js            # API de clientes: VOD + Series (Xtream)
│   ├── adminAuth.js            # login/logout admin
│   ├── adminUsuarios.js        # CRUD usuarios (clientes de la API)
│   ├── adminProveedores.js     # CRUD proveedores
│   └── adminContenido.js       # CRUD contenido + import M3U + borrado por categoría
├── public/                    # frontend del panel (HTML + Tailwind CDN + JS vanilla)
│   ├── index.html               # login
│   ├── dashboard.html           # panel (Películas / Series)
│   └── js/
│       ├── login.js
│       └── dashboard.js
├── package.json
├── render.yaml
├── .env.example
└── .gitignore
```

## Correr en local

```bash
npm install
cp .env.example .env      # en Windows (CMD): copy .env.example .env
npm start
```

- Panel admin: `http://localhost:3000/SNEOSMART5/admin`
- API cliente: `http://localhost:3000/player_api.php` (o `/SNEOSMART5/api/player_api.php`)
- Usuario admin por defecto: el que definas en `.env` (`ADMIN_USERNAME` / `ADMIN_PASSWORD`).

> Requisito: Node.js **22.5 o superior**. Vas a ver un aviso
> `ExperimentalWarning: SQLite is an experimental feature` al arrancar — es normal.

## Desplegar en Render (plan Free)

1. Subí esta carpeta a un repo nuevo de GitHub:
   ```bash
   git init
   git add .
   git commit -m "Backend VOD/Series"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
   git push -u origin main
   ```
2. En Render: **New > Web Service**, conectá ese repo.
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: **Free**
3. En **Environment**, agregá:
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
   - `JWT_SECRET` (cualquier cadena larga random)
   - `NODE_ENV=production`
4. Deploy. Render te da una URL tipo `https://tu-app-vod.onrender.com`.
   - Panel: `https://tu-app-vod.onrender.com/SNEOSMART5/admin`
   - API: `https://tu-app-vod.onrender.com/player_api.php`

Alternativa: con el `render.yaml` incluido, Render puede crear el servicio
automáticamente vía **New > Blueprint**.

### ⚠️ Persistencia de la base de datos

El plan **Free** de Render usa disco efímero: cada redeploy o reinicio por
inactividad borra `vodseries.db` y arranca de cero (con el admin y una
película demo). Si necesitás que el contenido persista entre reinicios, la
opción más simple es sumar un **Persistent Disk** (requiere plan pago), o
migrar a una base externa gratuita como Turso (compatible con SQLite).

## Panel admin

- `/SNEOSMART5/admin` → login y dashboard con pestañas **Películas** / **Series**.
- Por default se ven **categorías con cantidad de elementos** (no cada ítem individual),
  para no tener que renderizar miles de filas de una. Entrando a una categoría
  puntual recién ahí se cargan sus películas/episodios.
- **Importar lista M3U**: pegás una URL o el contenido de una lista, con filtro
  opcional por categoría (ej: traer solo lo que contenga "PELICULAS" o "SERIES"
  de una lista mixta) y tipo forzado (Película/Serie) para toda la tanda.
- **Series**: si titulás los episodios como `"Nombre del show S01E02"`, el
  sistema los agrupa automáticamente en una sola ficha de serie con
  temporadas y episodios. Si no sigue ese patrón, cada entrada se trata como
  una serie de un solo episodio.
- **Borrar categoría**: elimina de una sola vez todo el contenido de esa
  categoría (no hace falta borrar ítem por ítem).
- Campo **TMDB ID** opcional por ítem (se completa solo si la lista M3U
  importada trae el atributo `tmdb-id="..."`).

## API pública (estilo Xtream Codes)

Disponible tanto en la **raíz del dominio** (para apps estándar tipo IPTV
Smarters/TiviMate que arman `{servidor}/player_api.php` solas) como bajo
`/SNEOSMART5/api/player_api.php`.

### Login (sin parámetro `action`)

```
GET /player_api.php?username=USUARIO&password=CLAVE
```

Responde siempre `200 OK`; el resultado se comunica con `"auth": 1` o `"auth": 0`
dentro del JSON (igual que Xtream real), con `status`: `Active` / `Expired` / `Disabled`.

### Películas

```
GET /player_api.php?username=&password=&action=get_vod_categories
GET /player_api.php?username=&password=&action=get_vod_streams[&category_id=]
GET /player_api.php?username=&password=&action=get_vod_info&vod_id=123
```

### Series

```
GET /player_api.php?username=&password=&action=get_series_categories
GET /player_api.php?username=&password=&action=get_series[&category_id=]
GET /player_api.php?username=&password=&action=get_series_info&series_id=123
```

### Reproducción real del stream

```
GET /movie/{usuario}/{contraseña}/{id}.{ext}
GET /series/{usuario}/{contraseña}/{id}.{ext}
```

Valida las credenciales y redirige (302) al link real cargado en el panel.
