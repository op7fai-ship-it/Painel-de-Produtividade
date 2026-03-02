import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'sua_chave_secreta_super_segura_2024';
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, '') || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_REST_URL = SUPABASE_URL ? `${SUPABASE_URL}/rest/v1` : '';

const CORS_ORIGIN = process.env.CORS_ORIGIN || true;
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const CATEGORIAS_VALIDAS = [
  'Automação & IA',
  'Planejamento',
  'Criação & Design',
  'Suporte & Atendimento',
  'Tráfego Pago'
];

function ensureSupabaseConfig() {
  if (!SUPABASE_REST_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.');
  }
}

function mapUserRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    userType: row.user_type,
    avatar: row.avatar
  };
}

function mapUserRowWithPassword(row) {
  if (!row) return null;

  return {
    ...mapUserRow(row),
    password: row.password,
    createdAt: row.created_at
  };
}

function mapDemandaRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    categoria: row.categoria,
    cliente: row.cliente,
    descricao: row.descricao,
    tempo: row.tempo,
    status: row.status,
    data: row.data
  };
}

function buildQueryString({
  select,
  filters = [],
  order,
  limit,
  offset
} = {}) {
  const params = new URLSearchParams();

  if (select) params.set('select', select);
  if (order) params.set('order', order);
  if (typeof limit === 'number') params.set('limit', String(limit));
  if (typeof offset === 'number') params.set('offset', String(offset));

  for (const filter of filters) {
    const {
      column,
      operator = 'eq',
      value
    } = filter;

    if (value === undefined || value === null || value === '') continue;
    params.append(column, `${operator}.${value}`);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

async function supabaseRequest(table, options = {}) {
  ensureSupabaseConfig();

  const {
    method = 'GET',
    select,
    filters,
    order,
    limit,
    offset,
    body,
    returning = false
  } = options;

  const query = buildQueryString({ select, filters, order, limit, offset });
  const url = `${SUPABASE_REST_URL}/${table}${query}`;

  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (returning) {
    headers.Prefer = 'return=representation';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    let errorMessage = `${response.status} ${response.statusText}`;

    try {
      const errorBody = await response.json();
      errorMessage = errorBody.message || errorBody.error_description || errorBody.hint || errorMessage;
    } catch {
      const text = await response.text();
      if (text) errorMessage = text;
    }

    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function getSingle(table, options = {}) {
  const rows = await supabaseRequest(table, {
    ...options,
    limit: 1
  });

  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function insertRows(table, body, select = '*') {
  return supabaseRequest(table, {
    method: 'POST',
    body,
    select,
    returning: true
  });
}

async function updateRows(table, body, filters, select = '*') {
  return supabaseRequest(table, {
    method: 'PATCH',
    body,
    filters,
    select,
    returning: true
  });
}

async function deleteRows(table, filters) {
  return supabaseRequest(table, {
    method: 'DELETE',
    filters
  });
}

export async function initializeAdminUser() {
  try {
    await updateRows(
      'users',
      { user_type: 'colaborador' },
      [
        { column: 'user_type', value: 'adm_supremo' },
        { column: 'email', operator: 'neq', value: 'op7f.ai@gmail.com' }
      ],
      'id'
    );

    const op7Admin = await getSingle('users', {
      select: '*',
      filters: [{ column: 'email', value: 'op7f.ai@gmail.com' }]
    });

    if (!op7Admin) {
      const hashedPassword = await bcryptjs.hash('AdminSupremo123!', 10);
      await insertRows('users', {
        name: 'OP7 Admin',
        email: 'op7f.ai@gmail.com',
        password: hashedPassword,
        user_type: 'adm_supremo'
      }, 'id');
    } else if (op7Admin.user_type !== 'adm_supremo') {
      await updateRows(
        'users',
        { user_type: 'adm_supremo' },
        [{ column: 'id', value: op7Admin.id }],
        'id'
      );
    }

    const legacyAdmin = await getSingle('users', {
      select: 'id',
      filters: [{ column: 'email', value: 'admin@agencia.com' }]
    });

    if (legacyAdmin) {
      await updateRows(
        'users',
        { user_type: 'colaborador' },
        [{ column: 'id', value: legacyAdmin.id }],
        'id'
      );
    }
  } catch (error) {
    console.error('Erro ao inicializar admin:', error.message);
  }
}

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token ausente' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Token inválido' });
    }

    req.user = user;
    next();
  });
};

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, userType } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Nome, email e senha são obrigatórios' });
    }

    const validUserTypes = ['colaborador', 'diretor', 'adm_supremo'];
    const type = userType || 'colaborador';

    if (!validUserTypes.includes(type)) {
      return res.status(400).json({ message: 'Tipo de usuário inválido' });
    }

    const existingUser = await getSingle('users', {
      select: 'id',
      filters: [{ column: 'email', value: email }]
    });

    if (existingUser) {
      return res.status(400).json({ message: 'Email já cadastrado' });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);
    const insertedUsers = await insertRows('users', {
      name,
      email,
      password: hashedPassword,
      user_type: type
    });

    const user = mapUserRow(insertedUsers?.[0]);
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({ token, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = mapUserRowWithPassword(await getSingle('users', {
      select: '*',
      filters: [{ column: 'email', value: email }]
    }));

    if (!user) {
      return res.status(400).json({ message: 'Usuário não encontrado' });
    }

    const validPassword = await bcryptjs.compare(password, user.password);

    if (!validPassword) {
      return res.status(400).json({ message: 'Senha inválida' });
    }

    const userObj = {
      id: user.id,
      name: user.name,
      email: user.email,
      userType: user.userType,
      avatar: user.avatar
    };

    const token = jwt.sign(userObj, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: userObj });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json(req.user);
});

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const { name, avatar, newPassword, currentPassword } = req.body;
    const updates = {};

    if (name) updates.name = name;
    if (avatar) updates.avatar = avatar;

    if (newPassword && currentPassword) {
      const user = await getSingle('users', {
        select: 'password',
        filters: [{ column: 'id', value: req.user.id }]
      });

      const validPassword = user && await bcryptjs.compare(currentPassword, user.password);
      if (!validPassword) {
        return res.status(400).json({ message: 'Senha atual inválida' });
      }

      updates.password = await bcryptjs.hash(newPassword, 10);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'Nenhum campo para atualizar' });
    }

    const updatedUsers = await updateRows(
      'users',
      updates,
      [{ column: 'id', value: req.user.id }]
    );

    const updatedUser = mapUserRow(updatedUsers?.[0]);
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/demandas', authenticateToken, async (req, res) => {
  try {
    const { categoria, status, userId } = req.query;
    const filters = [];

    if (req.user.userType === 'colaborador') {
      filters.push({ column: 'user_id', value: req.user.id });
    } else if (userId) {
      filters.push({ column: 'user_id', value: userId });
    }

    if (categoria) {
      if (!CATEGORIAS_VALIDAS.includes(categoria)) {
        return res.status(400).json({ message: 'Categoria inválida' });
      }

      filters.push({ column: 'categoria', value: categoria });
    }

    if (status) {
      filters.push({ column: 'status', value: status });
    }

    const demandas = await supabaseRequest('demandas', {
      select: '*',
      filters,
      order: 'data.desc'
    });

    res.json((demandas || []).map(mapDemandaRow));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/demandas/:id', authenticateToken, async (req, res) => {
  try {
    const demanda = await getSingle('demandas', {
      select: '*',
      filters: [
        { column: 'id', value: req.params.id },
        { column: 'user_id', value: req.user.id }
      ]
    });

    if (!demanda) {
      return res.status(404).json({ message: 'Demanda não encontrada' });
    }

    res.json(mapDemandaRow(demanda));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/demandas', authenticateToken, async (req, res) => {
  try {
    const { categoria, cliente, descricao, tempo, status } = req.body;

    if (!CATEGORIAS_VALIDAS.includes(categoria)) {
      return res.status(400).json({
        message: `Categoria inválida. Categorias válidas: ${CATEGORIAS_VALIDAS.join(', ')}`
      });
    }

    const insertedDemandas = await insertRows('demandas', {
      user_id: req.user.id,
      categoria,
      cliente,
      descricao,
      tempo,
      status: status || 'Pendente'
    });

    res.status(201).json(mapDemandaRow(insertedDemandas?.[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.patch('/api/demandas/:id', authenticateToken, async (req, res) => {
  try {
    const demanda = await getSingle('demandas', {
      select: '*',
      filters: [
        { column: 'id', value: req.params.id },
        { column: 'user_id', value: req.user.id }
      ]
    });

    if (!demanda) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    const { status, categoria, cliente, descricao, tempo } = req.body;
    const updates = {};

    if (status) updates.status = status;
    if (categoria) updates.categoria = categoria;
    if (cliente) updates.cliente = cliente;
    if (descricao) updates.descricao = descricao;
    if (tempo !== undefined) updates.tempo = tempo;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'Nenhum campo para atualizar' });
    }

    if (updates.categoria && !CATEGORIAS_VALIDAS.includes(updates.categoria)) {
      return res.status(400).json({ message: 'Categoria inválida' });
    }

    const updatedDemandas = await updateRows(
      'demandas',
      updates,
      [{ column: 'id', value: req.params.id }]
    );

    res.json(mapDemandaRow(updatedDemandas?.[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/demandas/:id', authenticateToken, async (req, res) => {
  try {
    const demanda = await getSingle('demandas', {
      select: 'id',
      filters: [
        { column: 'id', value: req.params.id },
        { column: 'user_id', value: req.user.id }
      ]
    });

    if (!demanda) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    await deleteRows('demandas', [{ column: 'id', value: req.params.id }]);
    res.json({ message: 'Demanda deletada' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const todayStart = `${today}T00:00:00.000Z`;
    const weekAgoDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekAgo = weekAgoDate.toISOString();

    const [allUserDemandas, todayDemandas, weekDemandas, allDemandas] = await Promise.all([
      supabaseRequest('demandas', {
        select: '*',
        filters: [{ column: 'user_id', value: req.user.id }]
      }),
      supabaseRequest('demandas', {
        select: '*',
        filters: [
          { column: 'user_id', value: req.user.id },
          { column: 'data', operator: 'gte', value: todayStart }
        ]
      }),
      supabaseRequest('demandas', {
        select: '*',
        filters: [
          { column: 'user_id', value: req.user.id },
          { column: 'data', operator: 'gte', value: weekAgo }
        ],
        order: 'data.asc'
      }),
      supabaseRequest('demandas', {
        select: 'user_id,tempo,data',
        filters: [{ column: 'data', operator: 'gte', value: weekAgo }]
      })
    ]);

    const totalToday = (todayDemandas || []).reduce((sum, item) => sum + (item.tempo || 0), 0);
    const totalWeek = (weekDemandas || []).reduce((sum, item) => sum + (item.tempo || 0), 0);

    const weeklyMap = new Map();
    for (const demanda of weekDemandas || []) {
      const dateKey = new Date(demanda.data).toISOString().split('T')[0];
      weeklyMap.set(dateKey, (weeklyMap.get(dateKey) || 0) + (demanda.tempo || 0));
    }

    const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const weeklyData = Array.from(weeklyMap.entries()).map(([date, totalMinutes]) => ({
      day: dayLabels[new Date(`${date}T00:00:00Z`).getUTCDay()],
      hours: Math.round(totalMinutes / 60)
    }));

    const byCategory = {};
    for (const demanda of allUserDemandas || []) {
      byCategory[demanda.categoria] = (byCategory[demanda.categoria] || 0) + (demanda.tempo || 0);
    }

    const overallAverage = allDemandas && allDemandas.length
      ? allDemandas.reduce((sum, item) => sum + (item.tempo || 0), 0) / allDemandas.length
      : 0;

    const rankingMap = new Map();
    for (const demanda of allDemandas || []) {
      rankingMap.set(demanda.user_id, (rankingMap.get(demanda.user_id) || 0) + (demanda.tempo || 0));
    }

    const ranking = Array.from(rankingMap.entries())
      .map(([id, totalTempo]) => ({ id, totalTempo }))
      .sort((a, b) => b.totalTempo - a.totalTempo);

    const myRankingIndex = ranking.findIndex((item) => Number(item.id) === Number(req.user.id));

    res.json({
      totalToday,
      totalWeek,
      productivity: Math.round((totalToday / 480) * 100),
      averageProductivity: Math.round(overallAverage),
      ranking: myRankingIndex >= 0 ? myRankingIndex + 1 : 0,
      weeklyData,
      byCategory
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/ranking', authenticateToken, async (req, res) => {
  try {
    const { period = 'semana' } = req.query;
    const normalizedPeriod = String(period)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    let daysAgo = 7;
    if (normalizedPeriod === 'mes') daysAgo = 30;
    if (normalizedPeriod === 'ano') daysAgo = 365;

    const startDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

    const [demandas, users] = await Promise.all([
      supabaseRequest('demandas', {
        select: 'user_id,tempo',
        filters: [{ column: 'data', operator: 'gte', value: startDate }]
      }),
      supabaseRequest('users', {
        select: 'id,name,email,avatar'
      })
    ]);

    const usersById = new Map((users || []).map((user) => [Number(user.id), user]));
    const totalsByUser = new Map();

    for (const demanda of demandas || []) {
      totalsByUser.set(
        Number(demanda.user_id),
        (totalsByUser.get(Number(demanda.user_id)) || 0) + (demanda.tempo || 0)
      );
    }

    const ranking = Array.from(totalsByUser.entries())
      .map(([userId, totalTempo]) => {
        const user = usersById.get(userId);
        if (!user) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          totalTempo
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.totalTempo - a.totalTempo);

    res.json(ranking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/admin/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.userType !== 'adm_supremo' && req.user.userType !== 'diretor') {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    const users = await supabaseRequest('users', {
      select: 'id,name,email,user_type,avatar',
      order: 'name.asc'
    });

    res.json((users || []).map(mapUserRow));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/admin/demandas', authenticateToken, async (req, res) => {
  try {
    if (req.user.userType !== 'adm_supremo' && req.user.userType !== 'diretor') {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    const { userId, categoria, status } = req.query;
    const filters = [];

    if (userId) filters.push({ column: 'user_id', value: userId });
    if (categoria) filters.push({ column: 'categoria', value: categoria });
    if (status) filters.push({ column: 'status', value: status });

    const [demandas, users] = await Promise.all([
      supabaseRequest('demandas', {
        select: '*',
        filters,
        order: 'data.desc'
      }),
      supabaseRequest('users', {
        select: 'id,name'
      })
    ]);

    const usersById = new Map((users || []).map((user) => [Number(user.id), user.name]));
    const response = (demandas || []).map((demanda) => ({
      ...mapDemandaRow(demanda),
      name: usersById.get(Number(demanda.user_id)) || null
    }));

    res.json(response);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/admin/users/:id/type', authenticateToken, async (req, res) => {
  try {
    if (req.user.userType !== 'adm_supremo') {
      return res.status(403).json({ message: 'Apenas ADM Supremo pode alterar tipos de usuário' });
    }

    const { userType } = req.body;
    const validUserTypes = ['colaborador', 'diretor', 'adm_supremo'];

    if (!validUserTypes.includes(userType)) {
      return res.status(400).json({ message: 'Tipo de usuário inválido' });
    }

    if (userType === 'adm_supremo') {
      const existingAdmin = await getSingle('users', {
        select: 'id',
        filters: [
          { column: 'user_type', value: 'adm_supremo' },
          { column: 'id', operator: 'neq', value: req.params.id }
        ]
      });

      if (existingAdmin) {
        return res.status(403).json({ message: 'Já existe um ADM Supremo' });
      }
    }

    const updatedUsers = await updateRows(
      'users',
      { user_type: userType },
      [{ column: 'id', value: req.params.id }],
      'id,name,email,user_type,avatar'
    );

    res.json(mapUserRow(updatedUsers?.[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.userType !== 'adm_supremo') {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    if (Number(req.user.id) === Number(req.params.id)) {
      return res.status(400).json({ message: 'Não é possível deletar sua própria conta' });
    }

    await deleteRows('users', [{ column: 'id', value: req.params.id }]);
    res.json({ message: 'Usuário deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/categorias', authenticateToken, async (req, res) => {
  res.json(CATEGORIAS_VALIDAS);
});

app.get('/health', async (req, res) => {
  try {
    await getSingle('users', {
      select: 'id',
      limit: 1
    });

    res.json({ status: 'ok', db: true, provider: 'supabase' });
  } catch (error) {
    res.status(500).json({ status: 'error', db: false, message: error.message });
  }
});

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_REST_URL && SUPABASE_SERVICE_ROLE_KEY);
}

export default app;
