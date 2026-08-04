import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { prompt, history, userContext } = await req.json();

    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY não configurada' },
        { status: 500 }
      );
    }

    const systemPrompt = `Você é o AXEL, assistente inteligente da Tracbel. 
O usuário logado é: ${userContext?.name || 'Não identificado'} (Matrícula: ${userContext?.registration || 'N/A'}, Role: ${userContext?.role || 'N/A'}, Filial ID: ${userContext?.branch_id || 'N/A'}).

O usuário vai pedir coisas em linguagem natural. Você deve analisar a intenção e retornar estritamente um JSON com a ação que o frontend deve tomar.
Não responda com texto livre, apenas com um objeto JSON válido.

Possíveis ações:
1. Navegar para uma página com filtros.
Exemplo: "me mostre os pagamentos pendentes" -> {"action": "navigate", "path": "/dashboard/nfs?tab=pending"}
Exemplo: "Me mostre as ultimas NF pagas para o fornecedor ALS" -> {"action": "navigate", "path": "/dashboard/nfs?tab=history&search=ALS"}
Exemplo: "minha(s) cautela(s)" -> {"action": "navigate", "path": "/dashboard/cautelia?user=${userContext?.registration || ''}"}
Exemplo: "Minhas ferramentas" -> {"action": "navigate", "path": "/dashboard/stock?user=${userContext?.registration || ''}"}
Exemplo: "notas da minha filial" -> {"action": "navigate", "path": "/dashboard/nfs?branch=${userContext?.branch_id || ''}"}
Exemplo: "ir para estoque" -> {"action": "navigate", "path": "/dashboard/stock"}
Exemplo: "fazer uma cautela" -> {"action": "navigate", "path": "/dashboard/cautelia"}

2. Responder perguntas gerais:
Exemplo: "o que você faz?" -> {"action": "reply", "message": "Sou o AXEL, posso te ajudar a navegar pelas NFs, ferramentas e pedidos da Tracbel!"}`;

    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...(history || []).map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.text,
      })),
      {
        role: 'user',
        content: prompt,
      },
    ];

    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'qwen/qwen3.6-27b',
          temperature: 0.1,
          response_format: {
            type: 'json_object',
          },
          messages,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Groq Error:', data);
      return NextResponse.json({ error: 'Erro AXEL', details: data?.error?.message }, { status: 500 });
    }

    const responseText = data?.choices?.[0]?.message?.content || '{}';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const cleanedJson = jsonMatch ? jsonMatch[0] : responseText;

    return NextResponse.json(JSON.parse(cleanedJson));
  } catch (error: any) {
    console.error('AXEL Error:', error);
    return NextResponse.json({ error: 'Processamento falhou', details: error.message }, { status: 500 });
  }
}
