import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { text, image, prompt } = await req.json();

    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
      return NextResponse.json(
        { error: 'GROQ_API_KEY não configurada' },
        { status: 500 }
      );
    }

    let userContent = prompt || '';

    if (text) {
      userContent += `\n\nTEXTO DA NOTA:\n${text}`;
    }

    if (image) {
      userContent += `\n\nIMAGEM BASE64:\n${image}`;
    }

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
          messages: [
            {
              role: 'system',
              content:
                'Você é um extrator de dados de notas fiscais. Retorne apenas JSON válido.',
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt || 'Extraia os dados desta nota fiscal.' },
                ...(text ? [{ type: 'text', text: `Texto extraído via OCR:\n${text}` }] : []),
                ...(image ? [{ 
                  type: 'image_url', 
                  image_url: { url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}` } 
                }] : []),
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Groq Error:', data);

      return NextResponse.json(
        {
          error: 'Erro Groq',
          details: data?.error?.message || 'Erro desconhecido',
        },
        { status: 500 }
      );
    }

    const responseText =
      data?.choices?.[0]?.message?.content || '{}';

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const cleanedJson = jsonMatch
        ? jsonMatch[0]
        : responseText;
      
      const parsed = JSON.parse(cleanedJson);
      return NextResponse.json(parsed);
    } catch (parseErr) {
      console.error('JSON Parse Error:', parseErr);
      return NextResponse.json(
        { error: 'Invalid JSON response from AI', details: responseText },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('AI Extraction Error:', error);

    return NextResponse.json(
      {
        error: 'AI processing failed',
        details: error.message,
      },
      { status: 500 }
    );
  }
}