const API_BASE = '/SNEOSMART5/admin/api';

let tipoActual = 'movie';       // 'movie' | 'series'
let categoriaActual = null;     // null = viendo la lista de categorías
let categoriasCache = [];
let proveedoresCache = [];

/* ---------- Utilidades (mismas que dashboard.js) ---------- */
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = '/index.html';
    throw new Error('No autenticado');
  }
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || 'Error en la solicitud');
  }
  return data;
}

function openModal(html) {
  document.getElementById('modalBox').innerHTML = html;
  document.getElementById('modalOverlay').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
}
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});

/* ---------- Sesión ---------- */
(async () => {
  try { await apiFetch(`${API_BASE}/auth/me`); } catch (_) {}
})();

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await apiFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
  window.location.href = '/index.html';
});

async function cargarProveedores() {
  const { proveedores } = await apiFetch(`${API_BASE}/proveedores`);
  proveedoresCache = proveedores;
}

/* ---------- Tabs de nivel superior: Usuarios / Contenido ---------- */
document.querySelectorAll('.top-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.top-tab-btn').forEach(b => b.className = 'top-tab-btn px-4 py-2 rounded-lg bg-slate-800 text-sm font-medium');
    btn.className = 'top-tab-btn px-4 py-2 rounded-lg bg-indigo-600 text-sm font-medium';
    document.querySelectorAll('.top-tab-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById(`top-${btn.dataset.tab}`).classList.remove('hidden');

    if (btn.dataset.tab === 'usuarios') cargarUsuarios();
    if (btn.dataset.tab === 'contenido') cargarCategorias();
  });
});

/* =========================================================
   USUARIOS (clientes que se loguean contra la API)
   ========================================================= */
function badgeEstado(estado) {
  const map = {
    activo: 'bg-emerald-500/20 text-emerald-400',
    suspendido: 'bg-slate-500/20 text-slate-400',
    vencido: 'bg-red-500/20 text-red-400',
  };
  return `<span class="px-2 py-0.5 rounded-full text-xs font-medium ${map[estado] || ''}">${estado}</span>`;
}

async function cargarUsuarios() {
  const buscar = document.getElementById('buscarUsuario').value.trim();
  const url = buscar ? `${API_BASE}/usuarios?buscar=${encodeURIComponent(buscar)}` : `${API_BASE}/usuarios`;
  const { usuarios } = await apiFetch(url);

  const tbody = document.getElementById('usuariosTbody');
  tbody.innerHTML = usuarios.map(u => `
    <tr>
      <td class="px-4 py-3 font-medium">${u.username}</td>
      <td class="px-4 py-3">${badgeEstado(u.estado)}</td>
      <td class="px-4 py-3 text-slate-400">${u.fecha_vencimiento}</td>
      <td class="px-4 py-3 text-slate-400">${u.max_conexiones}</td>
      <td class="px-4 py-3 text-right space-x-2">
        <button class="text-indigo-400 hover:underline text-xs" onclick="editarUsuario(${u.id})">Editar</button>
        <button class="text-amber-400 hover:underline text-xs" onclick="toggleUsuario(${u.id}, ${!u.activo})">
          ${u.activo ? 'Suspender' : 'Activar'}
        </button>
        <button class="text-red-400 hover:underline text-xs" onclick="borrarUsuario(${u.id})">Eliminar</button>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="px-4 py-6 text-center text-slate-500">Sin usuarios</td></tr>`;
}

document.getElementById('buscarUsuario').addEventListener('input', () => cargarUsuarios());

function formUsuarioHTML(u = {}) {
  return `
    <h2 class="text-lg font-semibold">${u.id ? 'Editar usuario' : 'Nuevo usuario'}</h2>
    <form id="usuarioForm" class="space-y-3">
      <div>
        <label class="block text-sm text-slate-400 mb-1">Usuario</label>
        <input name="username" value="${u.username || ''}" required
          class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm text-slate-400 mb-1">${u.id ? 'Nueva contraseña (opcional)' : 'Contraseña'}</label>
        <input name="password" type="text" ${u.id ? '' : 'required'}
          class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm text-slate-400 mb-1">Fecha de vencimiento</label>
        <input name="fecha_vencimiento" type="date" value="${u.fecha_vencimiento || ''}" required
          class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm text-slate-400 mb-1">Máx. conexiones</label>
        <input name="max_conexiones" type="number" min="1" value="${u.max_conexiones || 1}" required
          class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm text-slate-400 mb-1">Notas</label>
        <textarea name="notas" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">${u.notas || ''}</textarea>
      </div>
      <p id="usuarioFormError" class="text-red-400 text-sm hidden"></p>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" onclick="closeModal()" class="px-4 py-2 rounded-lg bg-slate-800 text-sm">Cancelar</button>
        <button type="submit" class="px-4 py-2 rounded-lg bg-indigo-600 text-sm font-medium">Guardar</button>
      </div>
    </form>
  `;
}

document.getElementById('nuevoUsuarioBtn').addEventListener('click', () => {
  openModal(formUsuarioHTML());
  bindUsuarioForm();
});

async function editarUsuario(id) {
  const { usuario } = await apiFetch(`${API_BASE}/usuarios/${id}`);
  openModal(formUsuarioHTML(usuario));
  bindUsuarioForm(id);
}

function bindUsuarioForm(id) {
  document.getElementById('usuarioForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    const errorEl = document.getElementById('usuarioFormError');
    try {
      if (id) {
        if (!payload.password) delete payload.password;
        await apiFetch(`${API_BASE}/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiFetch(`${API_BASE}/usuarios`, { method: 'POST', body: JSON.stringify(payload) });
      }
      closeModal();
      cargarUsuarios();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  });
}

async function toggleUsuario(id, activo) {
  await apiFetch(`${API_BASE}/usuarios/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ activo }) });
  cargarUsuarios();
}

async function borrarUsuario(id) {
  if (!confirm('¿Eliminar este usuario?')) return;
  await apiFetch(`${API_BASE}/usuarios/${id}`, { method: 'DELETE' });
  cargarUsuarios();
}

/* ---------- Sub-tabs Películas / Series ---------- */
document.querySelectorAll('.vod-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    tipoActual = btn.dataset.tipo;
    document.querySelectorAll('.vod-tab-btn').forEach(b => b.className = 'vod-tab-btn px-4 py-2 rounded-lg bg-slate-800 text-sm font-medium');
    btn.className = 'vod-tab-btn px-4 py-2 rounded-lg bg-purple-600 text-sm font-medium';
    document.getElementById('tituloSeccion').textContent = tipoActual === 'movie' ? 'Películas' : 'Series';
    volverACategorias();
  });
});

/* =========================================================
   VISTA DE CATEGORÍAS (default)
   ========================================================= */
async function cargarCategorias() {
  const { categorias } = await apiFetch(`${API_BASE}/contenido/categorias?tipo=${tipoActual}`);
  categoriasCache = categorias;
  renderCategorias();
}

function renderCategorias() {
  const filtro = document.getElementById('buscarCategoria').value.trim().toLowerCase();
  const lista = filtro
    ? categoriasCache.filter(c => c.categoria.toLowerCase().includes(filtro))
    : categoriasCache;

  const etiqueta = tipoActual === 'movie' ? 'película' : 'capítulo';
  const grid = document.getElementById('categoriasGrid');
  grid.innerHTML = lista.map(c => `
    <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
      <div>
        <p class="font-medium">${c.categoria}</p>
        <p class="text-slate-500 text-sm">${c.total} ${etiqueta}${c.total === 1 ? '' : 's'}</p>
      </div>
      <div class="flex gap-2 mt-auto">
        <button class="flex-1 bg-purple-600 hover:bg-purple-500 rounded-lg py-1.5 text-sm font-medium"
          onclick="verItemsDeCategoria('${c.categoria.replace(/'/g, "\\'")}')">
          Ver
        </button>
        <button class="bg-red-900/50 hover:bg-red-900 text-red-300 rounded-lg px-3 py-1.5 text-sm"
          onclick="borrarCategoriaCompleta('${c.categoria.replace(/'/g, "\\'")}')">
          Borrar
        </button>
      </div>
    </div>
  `).join('') || `<p class="text-slate-500 text-sm col-span-full text-center py-6">Sin categorías todavía. Importá una lista M3U o agregá contenido manualmente.</p>`;
}

document.getElementById('buscarCategoria').addEventListener('input', renderCategorias);

async function borrarCategoriaCompleta(categoria) {
  if (!confirm(`¿Eliminar TODO el contenido de la categoría "${categoria}"? Esta acción no se puede deshacer.`)) return;
  const { eliminados } = await apiFetch(`${API_BASE}/contenido/categoria/${encodeURIComponent(categoria)}`, { method: 'DELETE' });
  alert(`Se eliminaron ${eliminados} elementos de "${categoria}".`);
  cargarCategorias();
}

/* =========================================================
   VISTA DE ITEMS DE UNA CATEGORÍA (bajo demanda)
   ========================================================= */
function verItemsDeCategoria(categoria) {
  categoriaActual = categoria;
  document.getElementById('categoriasView').classList.add('hidden');
  document.getElementById('itemsView').classList.remove('hidden');
  document.getElementById('categoriaActualTitulo').textContent = categoria;
  document.getElementById('buscarItem').value = '';
  cargarItemsDeCategoriaActual();
}

function volverACategorias() {
  categoriaActual = null;
  document.getElementById('itemsView').classList.add('hidden');
  document.getElementById('categoriasView').classList.remove('hidden');
  cargarCategorias();
}
document.getElementById('volverCategoriasBtn').addEventListener('click', volverACategorias);

async function cargarItemsDeCategoriaActual() {
  if (!categoriaActual) return;
  const buscar = document.getElementById('buscarItem').value.trim();
  const params = new URLSearchParams({ categoria: categoriaActual, tipo: tipoActual });
  if (buscar) params.set('buscar', buscar);

  const { contenido } = await apiFetch(`${API_BASE}/contenido?${params.toString()}`);

  const tbody = document.getElementById('itemsTbody');
  tbody.innerHTML = contenido.map(c => `
    <tr>
      <td class="px-4 py-3 font-medium">${c.titulo}</td>
      <td class="px-4 py-3 text-slate-400">${c.tmdb_id || '—'}</td>
      <td class="px-4 py-3 text-slate-500 max-w-xs truncate" title="${c.url_stream}">${c.url_stream}</td>
      <td class="px-4 py-3 text-right space-x-2">
        <button class="text-indigo-400 hover:underline text-xs" onclick='editarItem(${JSON.stringify(c)})'>Editar</button>
        <button class="text-red-400 hover:underline text-xs" onclick="borrarItem(${c.id})">Eliminar</button>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="4" class="px-4 py-6 text-center text-slate-500">Sin contenido en esta categoría</td></tr>`;
}

document.getElementById('buscarItem').addEventListener('input', () => cargarItemsDeCategoriaActual());

function refrescarVista() {
  if (categoriaActual) cargarItemsDeCategoriaActual();
  else cargarCategorias();
}

/* ---------- Alta / edición manual ---------- */
function formItemHTML(c = {}) {
  return `
    <h2 class="text-lg font-semibold">${c.id ? 'Editar' : 'Agregar'} ${tipoActual === 'movie' ? 'película' : 'episodio de serie'}</h2>
    <form id="itemForm" class="space-y-3">
      <div>
        <label class="block text-sm text-slate-400 mb-1">
          Título ${tipoActual === 'series' ? '(usá el formato "Nombre S01E02" para que se agrupe bien)' : ''}
        </label>
        <input name="titulo" value="${c.titulo || ''}" required
          class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm text-slate-400 mb-1">URL del stream (MP4, M3U8, etc.)</label>
        <input name="url_stream" value="${c.url_stream || ''}" required
          class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm text-slate-400 mb-1">Categoría</label>
          <input name="categoria" value="${c.categoria || categoriaActual || 'General'}" required
            class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm text-slate-400 mb-1">TMDB ID (opcional)</label>
          <input name="tmdb_id" value="${c.tmdb_id || ''}"
            class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label class="block text-sm text-slate-400 mb-1">Logo/portada (URL, opcional)</label>
        <input name="logo" value="${c.logo || ''}"
          class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
      </div>
      <p id="itemFormError" class="text-red-400 text-sm hidden"></p>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" onclick="closeModal()" class="px-4 py-2 rounded-lg bg-slate-800 text-sm">Cancelar</button>
        <button type="submit" class="px-4 py-2 rounded-lg bg-purple-600 text-sm font-medium">Guardar</button>
      </div>
    </form>
  `;
}

document.getElementById('nuevoItemBtn').addEventListener('click', () => {
  openModal(formItemHTML());
  bindItemForm();
});

function editarItem(c) {
  openModal(formItemHTML(c));
  bindItemForm(c.id);
}

function bindItemForm(id) {
  document.getElementById('itemForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.tipo = tipoActual;
    const errorEl = document.getElementById('itemFormError');
    try {
      if (id) {
        await apiFetch(`${API_BASE}/contenido/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiFetch(`${API_BASE}/contenido`, { method: 'POST', body: JSON.stringify(payload) });
      }
      closeModal();
      refrescarVista();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    }
  });
}

async function borrarItem(id) {
  if (!confirm('¿Eliminar este elemento?')) return;
  await apiFetch(`${API_BASE}/contenido/${id}`, { method: 'DELETE' });
  refrescarVista();
}

/* ---------- Importar lista M3U (filtrada por tipo) ---------- */
function formImportarM3uHTML() {
  const proveedoresOptions = proveedoresCache.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
  return `
    <h2 class="text-lg font-semibold">Importar lista M3U — ${tipoActual === 'movie' ? 'Películas' : 'Series'}</h2>
    <p class="text-sm text-slate-400">
      Todo lo que se importe acá se va a guardar como <strong>${tipoActual === 'movie' ? 'película' : 'serie'}</strong>.
      Usá el filtro de categoría para traer solo la parte de la lista que te interesa
      (ej: "PELICULAS", "SERIES", "CINE").
    </p>
    <form id="importarM3uForm" class="space-y-3">
      <div>
        <label class="block text-sm text-slate-400 mb-1">URL de la lista M3U</label>
        <input name="url" type="text" placeholder="https://.../lista.m3u8"
          class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div class="text-center text-slate-500 text-xs">— o —</div>
      <div>
        <label class="block text-sm text-slate-400 mb-1">Pegar contenido de la lista</label>
        <textarea name="contenido_m3u" rows="6"
          class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-xs"></textarea>
      </div>
      <div>
        <label class="block text-sm text-slate-400 mb-1">Filtrar por categoría (opcional)</label>
        <input name="filtro_categoria" type="text" placeholder="ej: PELICULAS, SERIES..."
          class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm text-slate-400 mb-1">Proveedor (opcional, aplica a todos)</label>
        <select name="proveedor_id" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">
          <option value="">Sin proveedor</option>
          ${proveedoresOptions}
        </select>
      </div>
      <p id="importarM3uError" class="text-red-400 text-sm hidden"></p>
      <p id="importarM3uOk" class="text-emerald-400 text-sm hidden"></p>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" onclick="closeModal()" class="px-4 py-2 rounded-lg bg-slate-800 text-sm">Cancelar</button>
        <button type="submit" id="importarM3uSubmit" class="px-4 py-2 rounded-lg bg-emerald-600 text-sm font-medium">Importar</button>
      </div>
    </form>
  `;
}

document.getElementById('importarM3uBtn').addEventListener('click', async () => {
  if (proveedoresCache.length === 0) await cargarProveedores();
  openModal(formImportarM3uHTML());

  document.getElementById('importarM3uForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.tipo = tipoActual;
    if (!payload.proveedor_id) delete payload.proveedor_id;
    if (!payload.url) delete payload.url;
    if (!payload.contenido_m3u) delete payload.contenido_m3u;
    if (!payload.filtro_categoria) delete payload.filtro_categoria;

    const errorEl = document.getElementById('importarM3uError');
    const okEl = document.getElementById('importarM3uOk');
    const submitBtn = document.getElementById('importarM3uSubmit');
    errorEl.classList.add('hidden');
    okEl.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Importando...';

    try {
      const data = await apiFetch(`${API_BASE}/contenido/importar-m3u`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      okEl.textContent = `Se importaron ${data.importados} elementos correctamente.`;
      okEl.classList.remove('hidden');
      volverACategorias();
      setTimeout(closeModal, 1500);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Importar';
    }
  });
});

/* ---------- Carga inicial ---------- */
cargarUsuarios();
