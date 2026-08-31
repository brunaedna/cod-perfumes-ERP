export function parseIncomingMessage(rawMessage, sourceName, context) {
  const message = String(rawMessage || "");
  const lines = cleanMessageLines(message);
  const inferredPhone = readPhone(message);
  const inferredProduct = readProductDraft(lines, context.products);
  const labeledProductName = readLabel(message, ["produto", "perfume", "item"]);
  const customerPhone = readLabel(message, ["telefone", "fone", "whatsapp", "contato"]) || inferredPhone;
  const customer = readLabel(message, ["cliente", "comprador", "nome"]) || customerPhone || "Cliente a revisar";
  const sellerName = readLabel(message, ["vendedor", "vendido por", "seller"]);
  const delivererName = readLabel(message, ["entregador", "entrega", "motoboy", "delivery"]);
  const productName = labeledProductName || inferredProduct.name || findProductNameInText(message, context.products);
  const quantity = Number(readLabel(message, ["qtd", "quantidade"]) || inferredProduct.quantity || readQuantityInText(message) || 1);
  const paymentMethod = readPaymentMethod(message);
  const product = findProduct(productName || message, context.products);
  const seller = findPerson(sellerName || "", context.people);
  const deliverer = findPerson(delivererName || "", context.people);
  const unitPrice = readMoney(readLabel(message, ["valor", "preco", "preco unitario"])) || readMoney(message) || product?.price || 0;
  const confidence = calculateConfidence({ product, seller, deliverer, customer, customerPhone, productName, unitPrice, paymentMethod });

  return {
    source: "whatsapp_web",
    sourceName,
    rawMessage: message,
    status: "Pendente",
    confidence,
    draft: {
      customer,
      customerPhone,
      paymentMethod,
      status: "Entregue",
      sellerId: seller?.id || "",
      delivererId: deliverer?.id || "",
      items: [
        {
          productId: product?.id || "",
          productName: product?.name || productName || "",
          quantity: Math.max(1, quantity),
          unitPrice: roundMoney(unitPrice),
        },
      ],
    },
  };
}

export function splitMessages(text) {
  return String(text || "")
    .split(/\n\s*\n/g)
    .map((message) => message.trim())
    .filter(Boolean);
}

export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function readLabel(text, labels) {
  for (const label of labels) {
    const regex = new RegExp(`${label}\\s*[:=-]\\s*([^\\n]+)`, "i");
    const match = text.match(regex);
    if (match) return match[1].trim();
  }
  return "";
}

function findProductNameInText(text, products) {
  const product = products.find((item) => normalizeText(text).includes(normalizeText(item.name)));
  return product?.name || "";
}

function cleanMessageLines(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && /[\p{L}\p{N}$]/u.test(line));
}

function readPhone(text) {
  const match = String(text || "").match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/);
  return match ? match[0].trim() : "";
}

function readProductDraft(lines, products) {
  const productLine = lines.find((line) => {
    if (readPhone(line) || readMoney(line) || readPaymentMethod(line)) return false;
    if (readLabel(line, ["cliente", "comprador", "nome", "telefone", "valor", "preco", "pagamento"])) return false;
    return /[a-zA-ZÀ-ÿ]/.test(line);
  });

  if (!productLine) return { name: "", quantity: 1 };

  const match = productLine.match(/^\s*(\d+)\s*[xX]?\s+(.+)$/);
  const quantity = match ? Number(match[1]) : readQuantityInText(productLine);
  const rawName = match ? match[2] : productLine;
  const product = findProduct(rawName, products);

  return {
    name: product?.name || rawName.trim(),
    quantity: Math.max(1, quantity || 1),
  };
}

function readQuantityInText(text) {
  const match = text.match(/(\d+)\s*x\b|x\s*(\d+)|(\d+)\s*(un|und|unidade|unidades)/i);
  return match ? Number(match[1] || match[2] || match[3]) : 1;
}

function readPaymentMethod(text) {
  const normalized = normalizeText(text);
  if (normalized.includes("pix")) return "PIX";
  if (normalized.includes("dinheiro")) return "Dinheiro";
  if (normalized.includes("debito")) return "Cartao de debito";
  if (normalized.includes("credito") || normalized.includes("cartao")) return "Cartao de credito";
  return "";
}

function readMoney(value) {
  const match =
    String(value || "").match(/R\$\s*(\d+(?:[.,]\d{1,2})?)/i) ||
    String(value || "").match(/\b(\d+(?:[.,]\d{2}))\b/);
  return match ? Number(match[1].replace(",", ".")) : 0;
}

function findProduct(text, products) {
  const normalized = normalizeText(text);
  return products.find((product) => {
    const productName = normalizeText(product.name);
    return normalized.includes(productName) || productName.includes(normalized);
  });
}

function findPerson(text, people) {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  return people.find((person) => {
    const personName = normalizeText(person.name);
    return normalized.includes(personName) || personName.includes(normalized);
  });
}

function calculateConfidence({ product, seller, deliverer, customer, customerPhone, productName, unitPrice, paymentMethod }) {
  let score = 20;
  if (product) score += 30;
  else if (productName) score += 15;
  if (seller) score += 15;
  if (deliverer) score += 15;
  if (customer && customer !== "Cliente a revisar") score += 10;
  if (customerPhone) score += 10;
  if (unitPrice) score += 10;
  if (paymentMethod) score += 10;
  return Math.min(score, 100);
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
