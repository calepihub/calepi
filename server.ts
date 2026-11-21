import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.post('/api/assistant', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error:
          'Serviço de IA indisponível: GEMINI_API_KEY não configurada no ambiente. Todas as ferramentas determinísticas e paramétricas do KITNET PRO STUDIO continuam funcionando normalmente.',
      });
      return;
    }

    const { prompt, projectSummary } = req.body ?? {};
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Solicitação inválida. Informe um texto técnico para análise.' });
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
2. Quando o usuário solicitar uma tipologia ou ajuste (ex: "kitnet de 25 m², com banheiro de 3 m², cozinha integrada, dormitório, área de serviço e varanda"), preencha o objeto proposedTypology com parâmetros geométricos consistentes para prévia e autorização do usuário. Caso contrário, deixe applyTypologyProposal = false.
3. Responda em português do Brasil, de forma objetiva, técnica e transparente, indicando premissas e limitações quando aplicável.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Resumo atual do projeto:\n${JSON.stringify(projectSummary ?? {}, null, 2)}\n\nSolicitação do usuário:\n${prompt}`,
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
                  bedrooms: { type: Type.INTEGER },
                  bathrooms: { type: Type.INTEGER },
                  hasLaundry: { type: Type.BOOLEAN },
                  hasBalcony: { type: Type.BOOLEAN },
                  accessible: { type: Type.BOOLEAN },
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
      const message = err instanceof Error ? err.message : 'Erro desconhecido ao consultar Gemini API.';
      res.status(502).json({
        error: `Falha ao consultar o serviço de IA (${message}). As ferramentas paramétricas locais continuam disponíveis.`,
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
