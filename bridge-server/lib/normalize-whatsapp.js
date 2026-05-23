'use strict';

/**
 * Normaliza número WhatsApp BR para 12 dígitos (formato Evolution API).
 * Remove não-dígitos. Se startsWith('55') && length===13 && pos[4]==='9': remove o 9 extra.
 */
function normalizeWhatsAppNumberBR(num) {
  const digits = String(num).replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length === 13 && digits[4] === '9') {
    return digits.slice(0, 4) + digits.slice(5);
  }
  return digits;
}

module.exports = { normalizeWhatsAppNumberBR };
