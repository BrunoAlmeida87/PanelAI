// Catálogo inicial de ingredientes e produtos.
// id: identificador canônico e estável usado em receitas, estoque e listas.
// baseUnit: unidade em que o PanelAI soma e compara quantidades.
// unitWeight: gramas por unidade (quando a base é contável ou para converter "un").
// density: gramas por ml (permite converter colheres/xícaras em gramas).
// conversions: quanto da unidade-base existe em 1 unidade especial (ex.: 1 dente de alho = 5 g).
// flags: marcadores para deduzir restrições alimentares.
// ignoreStock: itens que não precisam de compra (ex.: água da torneira).

const I = (id, name, category, baseUnit, extra = {}) => ({
  id,
  name,
  category,
  baseUnit,
  flags: [],
  ...extra,
});

export const SEED_INGREDIENTS = [
  // Hortifruti
  I('alho', 'Alho', 'hortifruti', 'g', { conversions: { dente: 5 } }),
  I('cebola', 'Cebola', 'hortifruti', 'un', { unitWeight: 150 }),
  I('tomate', 'Tomate', 'hortifruti', 'un', { unitWeight: 120 }),
  I('batata', 'Batata', 'hortifruti', 'g', { unitWeight: 150 }),
  I('batata-doce', 'Batata-doce', 'hortifruti', 'g', { unitWeight: 250 }),
  I('mandioca', 'Mandioca', 'hortifruti', 'g'),
  I('cenoura', 'Cenoura', 'hortifruti', 'un', { unitWeight: 120 }),
  I('brocolis', 'Brócolis', 'hortifruti', 'g', { unitWeight: 350 }),
  I('abobrinha', 'Abobrinha', 'hortifruti', 'un', { unitWeight: 250 }),
  I('pimentao', 'Pimentão', 'hortifruti', 'un', { unitWeight: 150 }),
  I('repolho', 'Repolho', 'hortifruti', 'g', { unitWeight: 1200 }),
  I('alface', 'Alface', 'hortifruti', 'un', { unitWeight: 300 }),
  I('rucula', 'Rúcula', 'hortifruti', 'maco'),
  I('couve', 'Couve', 'hortifruti', 'maco'),
  I('espinafre', 'Espinafre', 'hortifruti', 'maco'),
  I('cheiro-verde', 'Cheiro-verde', 'hortifruti', 'maco'),
  I('coentro', 'Coentro', 'hortifruti', 'maco'),
  I('pepino', 'Pepino', 'hortifruti', 'un', { unitWeight: 200 }),
  I('cogumelo', 'Cogumelo (champignon)', 'hortifruti', 'g'),
  I('gengibre', 'Gengibre', 'hortifruti', 'g'),
  I('limao', 'Limão', 'hortifruti', 'un', { unitWeight: 100 }),
  I('banana', 'Banana', 'hortifruti', 'un', { unitWeight: 120 }),
  I('abacate', 'Abacate', 'hortifruti', 'un', { unitWeight: 400 }),
  I('manjericao', 'Manjericão', 'hortifruti', 'maco'),

  // Açougue
  I('peito-frango', 'Peito de frango', 'acougue', 'g', { flags: ['carne'] }),
  I('sobrecoxa', 'Sobrecoxa de frango', 'acougue', 'g', { flags: ['carne'] }),
  I('carne-moida', 'Carne moída', 'acougue', 'g', { flags: ['carne'] }),
  I('bife-contrafile', 'Contrafilé em bifes', 'acougue', 'g', { flags: ['carne'] }),
  I('file-mignon', 'Filé-mignon', 'acougue', 'g', { flags: ['carne'] }),
  I('acem', 'Acém', 'acougue', 'g', { flags: ['carne'] }),
  I('lombo-suino', 'Lombo suíno', 'acougue', 'g', { flags: ['carne'] }),
  I('bacon', 'Bacon', 'acougue', 'g', { flags: ['carne'] }),
  I('linguica-calabresa', 'Linguiça calabresa', 'acougue', 'g', { flags: ['carne'] }),

  // Peixaria
  I('tilapia', 'Filé de tilápia', 'peixaria', 'g', { flags: ['peixe'] }),
  I('salmao', 'Salmão', 'peixaria', 'g', { flags: ['peixe'] }),
  I('camarao', 'Camarão limpo', 'peixaria', 'g', { flags: ['peixe'] }),

  // Frios e laticínios
  I('ovos', 'Ovos', 'frios', 'un', { unitWeight: 50, flags: ['ovo'] }),
  I('leite', 'Leite', 'frios', 'ml', { density: 1.03, flags: ['lactose'] }),
  I('manteiga', 'Manteiga', 'frios', 'g', {
    flags: ['lactose'],
    conversions: { colher_sopa: 14, colher_cha: 5 },
  }),
  I('mussarela', 'Queijo muçarela', 'frios', 'g', { conversions: { fatia: 20 }, flags: ['lactose'] }),
  I('parmesao', 'Queijo parmesão ralado', 'frios', 'g', {
    flags: ['lactose'],
    conversions: { colher_sopa: 6 },
  }),
  I('presunto', 'Presunto', 'frios', 'g', { conversions: { fatia: 15 }, flags: ['carne'] }),
  I('creme-de-leite', 'Creme de leite', 'frios', 'g', {
    flags: ['lactose'],
    conversions: { caixa: 200, colher_sopa: 15 },
  }),
  I('requeijao', 'Requeijão', 'frios', 'g', { flags: ['lactose'], conversions: { colher_sopa: 15 } }),
  I('iogurte', 'Iogurte natural', 'frios', 'g', { unitWeight: 170, flags: ['lactose'] }),

  // Padaria
  I('pao-forma', 'Pão de forma', 'padaria', 'fatia', { conversions: { pacote: 20 }, flags: ['gluten'] }),
  I('pao-frances', 'Pão francês', 'padaria', 'un', { unitWeight: 50, flags: ['gluten'] }),
  I('pao-hamburguer', 'Pão de hambúrguer', 'padaria', 'un', { conversions: { pacote: 4 }, flags: ['gluten'] }),

  // Mercearia
  I('azeite', 'Azeite', 'mercearia', 'ml', { density: 0.92 }),
  I('oleo', 'Óleo de soja', 'mercearia', 'ml', { density: 0.92 }),
  I('oleo-gergelim', 'Óleo de gergelim', 'mercearia', 'ml', { density: 0.92 }),
  I('sal', 'Sal', 'mercearia', 'g', { density: 1.2 }),
  I('pimenta-do-reino', 'Pimenta-do-reino', 'mercearia', 'g', { density: 0.5 }),
  I('paprica', 'Páprica', 'mercearia', 'g', { density: 0.5 }),
  I('acucar', 'Açúcar', 'mercearia', 'g', { density: 0.85 }),
  I('farinha-trigo', 'Farinha de trigo', 'mercearia', 'g', { density: 0.5, flags: ['gluten'] }),
  I('goma-tapioca', 'Goma de tapioca', 'mercearia', 'g', { density: 0.6 }),
  I('aveia', 'Aveia em flocos', 'mercearia', 'g', { density: 0.4, flags: ['gluten'] }),
  I('maizena', 'Amido de milho', 'mercearia', 'g', { density: 0.55 }),
  I('molho-tomate', 'Molho de tomate', 'mercearia', 'g', { conversions: { un: 340 } }),
  I('shoyu', 'Shoyu', 'mercearia', 'ml', { density: 1.1, flags: ['gluten'] }),
  I('ketchup', 'Ketchup', 'mercearia', 'g', { density: 1.1 }),
  I('mostarda', 'Mostarda', 'mercearia', 'g', { density: 1.05 }),
  I('maionese', 'Maionese', 'mercearia', 'g', { density: 0.95, flags: ['ovo'] }),
  I('mel', 'Mel', 'mercearia', 'g', { density: 1.4, flags: ['mel'] }),
  I('leite-coco', 'Leite de coco', 'mercearia', 'ml', { density: 1 }),
  I('atum', 'Atum em lata', 'mercearia', 'g', { conversions: { lata: 120 }, flags: ['peixe'] }),
  I('milho-lata', 'Milho verde em lata', 'mercearia', 'g', { conversions: { lata: 170 }, density: 0.7 }),
  I('macarrao-espaguete', 'Macarrão espaguete', 'mercearia', 'g', { conversions: { pacote: 500 }, flags: ['gluten'] }),
  I('macarrao-penne', 'Macarrão penne', 'mercearia', 'g', { conversions: { pacote: 500 }, flags: ['gluten'] }),
  I('macarrao-yakisoba', 'Macarrão para yakisoba', 'mercearia', 'g', { conversions: { pacote: 500 }, flags: ['gluten'] }),
  I('cafe', 'Café em pó', 'mercearia', 'g', { conversions: { pacote: 500 } }),
  I('agua', 'Água', 'bebidas', 'ml', { density: 1, ignoreStock: true }),

  // Grãos
  I('arroz', 'Arroz branco', 'graos', 'g', { density: 0.78, conversions: { pacote: 5000 } }),
  I('feijao-carioca', 'Feijão carioca', 'graos', 'g', { density: 0.8, conversions: { pacote: 1000 } }),
  I('lentilha', 'Lentilha', 'graos', 'g', { density: 0.8, conversions: { pacote: 500 } }),
  I('grao-de-bico', 'Grão-de-bico', 'graos', 'g', { density: 0.8, conversions: { pacote: 500 } }),

  // Congelados
  I('pao-de-queijo', 'Pão de queijo congelado', 'congelados', 'g', { flags: ['lactose', 'ovo'] }),
  I('ervilha-congelada', 'Ervilha congelada', 'congelados', 'g'),

  // Bebidas
  I('suco-uva', 'Suco de uva integral', 'bebidas', 'ml'),

  // Limpeza
  I('detergente', 'Detergente', 'limpeza', 'un'),
  I('sabao-po', 'Sabão em pó', 'limpeza', 'g', { conversions: { pacote: 1600 } }),
  I('agua-sanitaria', 'Água sanitária', 'limpeza', 'ml'),
  I('esponja', 'Esponja', 'limpeza', 'un'),
  I('saco-lixo', 'Saco de lixo', 'limpeza', 'pacote'),

  // Higiene
  I('papel-higienico', 'Papel higiênico', 'higiene', 'rolo', { conversions: { pacote: 12 } }),
  I('sabonete', 'Sabonete', 'higiene', 'un'),
  I('creme-dental', 'Creme dental', 'higiene', 'un'),
  I('shampoo', 'Shampoo', 'higiene', 'un'),
];
