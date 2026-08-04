import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Exports a DOM element to a PDF file.
 * @param elementId The ID of the element to capture.
 * @param fileName The name of the PDF file to be downloaded.
 */
export async function exportToPDF(elementId: string, fileName: string = 'comprovante.pdf') {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with ID ${elementId} not found.`);
    return;
  }

  try {
    // Clone the element to render it off-screen without affecting the DOM
    const clone = element.cloneNode(true) as HTMLElement;
    clone.classList.remove('hidden');
    clone.style.display = 'block';
    clone.style.position = 'absolute';
    clone.style.top = '-9999px';
    clone.style.left = '-9999px';
    document.body.appendChild(clone);
    
    // Capture the element
    const canvas = await html2canvas(clone, {
      scale: 2, // Higher scale for better quality
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      onclone: (clonedDoc) => {
        const allElements = clonedDoc.getElementsByTagName('*');
        for (let i = 0; i < allElements.length; i++) {
          const el = allElements[i] as HTMLElement;
          const styles = window.getComputedStyle(el);
          
          const colorProps = ['color', 'backgroundColor', 'borderColor', 'fill', 'stroke'];
          
          colorProps.forEach(prop => {
            const value = (styles as any)[prop];
            if (value && typeof value === 'string' && value.includes('oklch')) {
              const temp = document.createElement('div');
              temp.style.color = value;
              document.body.appendChild(temp);
              const rgbValue = window.getComputedStyle(temp).color;
              document.body.removeChild(temp);
              
              if (rgbValue && !rgbValue.includes('oklch')) {
                (el.style as any)[prop] = rgbValue;
              } else {
                if (prop === 'color') el.style.color = '#000000';
                if (prop === 'backgroundColor') el.style.backgroundColor = '#ffffff';
              }
            }
          });
        }
      }
    });

    // Clean up
    document.body.removeChild(clone);

    const imgData = canvas.toDataURL('image/png');
    
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(fileName);
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Erro ao gerar o PDF. Verifique se as imagens foram carregadas corretamente.');
  }
}
