import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function initFirebaseAdminAuth() {
  try {
    const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const fbConfig = JSON.parse(raw) as { projectId?: string };
    if (!fbConfig.projectId || fbConfig.projectId === 'remixed-project-id') {
      return null;
    }
    const adminApp = getApps().length
      ? getApp()
      : initializeApp({ projectId: fbConfig.projectId });
    return getAuth(adminApp);
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const adminAuth = initFirebaseAdminAuth();

  app.use(express.json({ limit: '512kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.post('/api/assistant', async (req, res) => {
    if (!adminAuth) {
      res.status(503).json({
        error: 'Autenticação do servidor indisponível no momento.',
      });
      return;
    }

    const authHeader = req.headers.authorization;
    const token =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : '';

    if (!token) {
      res.status(401).json({
        error: 'Sessão não autenticada. Faça login com sua conta Google para consultar o assistente.',
      });
      return;
    }

    try {
      const decoded = await adminAuth.verifyIdToken(token);
      if (decoded.email_verified !== true) {
        res.status(403).json({
          error: 'E-mail não verificado na conta autenticada.',
        });
        return;
      }
    } catch {
      res.status(401).json({
        error: 'Token de autenticação inválido ou expirado. Recarregue a sessão.',
      });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error:
          'Serviço de IA indisponível: GEMINI_API_KEY não configurada no ambiente. Todas as ferramentas determinísticas e paramétricas do KITNET PRO STUDIO continuam funcionando normalmente.',
      });
      return;
    }

    const { prompt, projectSummary } = req.body ?? {};
    if (
      typeof prompt !== 'string' ||
      prompt.trim().length === 0 ||
      prompt.length > 2000
    ) {
      res.status(400).json({
        error: 'Solicitação inválida. Informe um texto técnico entre 1 e 2000 caracteres.',
      });
      return;
    }

    const serializedSummary = JSON.stringify(projectSummary ?? {}, null, 2);
    if (serializedSummary.length > 24000) {
      res.status(413).json({
        error: 'Resumo do projeto excede o limite técnico permitido para consulta.',
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const systemInstruction = `Você é o ASSISTENTE TÉCNICO KITNET PRO, auxiliar de arquitetura e engenharia do software KITNET PRO STUDIO.
Regras obrigatórias:
1. Você NUNCA substitui os motores determinísticos. Nunca invente resultados estruturais, armaduras, preços de mercado, valores normativos exatos não informados ou aprovação legal municipal.
2. Quando o usuário solicitar uma tipologia ou ajuste (ex: "kitnet de 25 m², com banheiro de 3 m², cozinha integrada, dormitório, área de serviço, mezanino e varanda"), preencha o objeto proposedTypology com parâmetros geométricos consistentes para prévia e autorização do usuário. Caso contrário, deixe applyTypologyProposal = false.
3. Responda em português do Brasil, de forma objetiva, técnica e transparente, indicando premissas e limitações quando aplicável.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Resumo atual do projeto:\n${serializedSummary}\n\nSolicitação do usuário:\n${prompt.trim()}`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer: {
                type: Type.STRING,
                description: 'Resposta técnica clara para o usuário em português.',
              },
              applyTypologyProposal: {
                type: Type.BOOLEAN,
                description: 'True apenas se o usuário pediu para criar ou configurar uma tipologia de kitnet.',
              },
              proposedTypology: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  targetArea: { type: Type.NUMBER },
                  width: { type: Type.NUMBER },
                  depth: { type: Type.NUMBER },
                  ceilingHeight: { type: Type.NUMBER },
                  bedrooms: { type: Type.INTEGER },
                  bathrooms: { type: Type.INTEGER },
                  hasLaundry: { type: Type.BOOLEAN },
                  hasBalcony: { type: Type.BOOLEAN },
                  hasMezzanine: { type: Type.BOOLEAN },
                  accessible: { type: Type.BOOLEAN },
                  entrySide: { type: Type.STRING },
                  internalPartitionType: { type: Type.STRING },
                },
              },
              warnings: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
          },
        },
      });

      const text = (response.text ?? '{}').trim();
      const parsed = JSON.parse(text);
      res.json(parsed);
    } catch (err) {
      console.error('Assistant request error:', err instanceof Error ? err.message : 'unknown');
      res.status(502).json({
        error:
          'Não foi possível processar a consulta de IA no momento. As ferramentas paramétricas locais continuam disponíveis.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KITNET PRO STUDIO running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
