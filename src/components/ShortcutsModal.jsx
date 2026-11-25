import { Modal } from './ui.jsx';

const SHORTCUTS = [
  ['1 – 6', 'Ir para Cardápio, Lista, Mercado, Receitas, Tarefas e Montessori'],
  ['← / →', 'Semana anterior / próxima'],
  ['T', 'Voltar para a semana atual'],
  ['/', 'Buscar na tela atual'],
  ['N', 'Nova receita (em Receitas)'],
  ['Esc', 'Fechar janelas'],
  ['?', 'Mostrar esta ajuda'],
];

export function ShortcutsModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Atalhos de teclado" size="sm">
      <table class="table">
        <tbody>
          {SHORTCUTS.map(([k, d]) => (
            <tr key={k}>
              <td class="nowrap">
                <span class="kbd">{k}</span>
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
