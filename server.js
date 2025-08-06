const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const compression = require('compression');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Cache com TTL de 10 minutos
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// Middleware de segurança
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Compressão GZIP
app.use(compression());

// CORS configurado para a plataforma V.I.G.I.A.
app.use(cors({
  origin: [
    'https://majsamse.gensparkspace.com',
    'https://usodojax.gensparkspace.com',
    'https://*.gensparkspace.com',
    'http://localhost:3000',
    'https://localhost:3000'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Rate limiting - 500 requests por 15 minutos por IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: {
    error: 'Muitas requisições. Tente novamente em 15 minutos.',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// JSON parsing
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'V.I.G.I.A. Recife - Proxy Server',
    status: 'Online',
    vereador: 'Rinaldo Júnior',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    endpoints: {
      receitas: '/api/receitas',
      despesas: '/api/despesas',
      health: '/health'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    cache_stats: {
      keys: cache.keys().length,
      hits: cache.getStats().hits,
      misses: cache.getStats().misses
    }
  });
});

// Endpoint para Receitas 2025
app.get('/api/receitas', async (req, res) => {
  try {
    const { limit = 100, offset = 0, orgao, categoria } = req.query;
    const cacheKey = `receitas_${limit}_${offset}_${orgao || 'all'}_${categoria || 'all'}`;
    
    // Verificar cache primeiro
    let cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json({
        success: true,
        cached: true,
        timestamp: new Date().toISOString(),
        total: cachedData.result.total,
        records: cachedData.result.records
      });
    }

    // Buscar dados da API oficial
    const apiUrl = `http://dados.recife.pe.gov.br/api/3/action/datastore_search?resource_id=14618877-8c0e-4223-a126-12333f1f614e&limit=${limit}&offset=${offset}`;
    
    const response = await fetch(apiUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'VIGIA-Recife-Proxy/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`API response: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error('API retornou erro');
    }

    // Armazenar no cache
    cache.set(cacheKey, data, 600); // 10 minutos

    res.json({
      success: true,
      cached: false,
      timestamp: new Date().toISOString(),
      total: data.result.total,
      records: data.result.records
    });

  } catch (error) {
    console.error('Erro ao buscar receitas:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar dados de receitas',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para Despesas 2025
app.get('/api/despesas', async (req, res) => {
  try {
    const { limit = 100, offset = 0, categoria, orgao } = req.query;
    const cacheKey = `despesas_${limit}_${offset}_${categoria || 'all'}_${orgao || 'all'}`;
    
    // Verificar cache primeiro
    let cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json({
        success: true,
        cached: true,
        timestamp: new Date().toISOString(),
        total: cachedData.result.total,
        records: cachedData.result.records
      });
    }

    // Buscar dados da API oficial
    const apiUrl = `http://dados.recife.pe.gov.br/api/3/action/datastore_search?resource_id=5a0e2e5d-125b-4ce2-8aea-940eaf782069&limit=${limit}&offset=${offset}`;
    
    const response = await fetch(apiUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'VIGIA-Recife-Proxy/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`API response: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error('API retornou erro');
    }

    // Armazenar no cache
    cache.set(cacheKey, data, 600); // 10 minutos

    res.json({
      success: true,
      cached: false,
      timestamp: new Date().toISOString(),
      total: data.result.total,
      records: data.result.records
    });

  } catch (error) {
    console.error('Erro ao buscar despesas:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar dados de despesas',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para limpar cache (uso administrativo)
app.post('/api/cache/clear', (req, res) => {
  const keys = cache.keys();
  cache.flushAll();
  res.json({
    success: true,
    message: 'Cache limpo com sucesso',
    cleared_keys: keys.length,
    timestamp: new Date().toISOString()
  });
});

// Tratamento de rotas não encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint não encontrado',
    available_endpoints: ['/api/receitas', '/api/despesas', '/health'],
    timestamp: new Date().toISOString()
  });
});

// Tratamento global de erros
app.use((error, req, res, next) => {
  console.error('Erro global:', error);
  res.status(500).json({
    error: 'Erro interno do servidor',
    timestamp: new Date().toISOString()
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 V.I.G.I.A. Recife Proxy Server rodando na porta ${PORT}`);
  console.log(`📊 Endpoints disponíveis:`);
  console.log(`   • GET /api/receitas - Receitas municipais 2025`);
  console.log(`   • GET /api/despesas - Despesas municipais 2025`);
  console.log(`   • GET /health - Status do servidor`);
  console.log(`🏛️ Vereador: Rinaldo Júnior`);
  console.log(`👨‍💻 Desenvolvido para: Arthur Figueiroa`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 Desligando servidor...');
  cache.flushAll();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔄 Desligando servidor...');
  cache.flushAll();
  process.exit(0);
});
