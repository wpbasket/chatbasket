// state/modals/modals.ts
import type {
  ConfirmModalProps,
  ControllersModalProps,
  DropdownPickerModalProps,
  LoadingModalProps,
  ModalPosition,
  ModalType,
} from '@/components/modals/types/modal.types';
import { observable } from '@legendapp/state';

// A single modal entry in the stack
export interface ModalEntry {
  id?: string;
  type: ModalType;
  props: Record<string, any>;
  position?: ModalPosition;
}

// Stack of modals (last item is top-most)
export const modals$ = observable<ModalEntry[]>([]);

// Backward-compatible top-level modal state used by existing code.
// We keep this in sync with the top of the stack so older code continues to work.
export const modal$ = observable({
  isVisible: false,
  type: 'confirm' as ModalType,
  props: {} as Record<string, any>,
  id: undefined as string | undefined,
  position: undefined as ModalPosition | undefined,
});

function syncTopToLegacy() {
  const stack = modals$.get();
  const top = stack[stack.length - 1];
  if (top) {
    modal$.assign({
      isVisible: true,
      type: top.type,
      props: top.props || {},
      id: top.id,
      position: top.position,
    });
  } else {
    modal$.assign({
      isVisible: false,
      type: 'confirm' as ModalType,
      props: {},
      id: undefined,
      position: undefined,
    });
  }
}

export const modalActions = {
  // Open a modal (push onto stack)
  open: (type: ModalType, props: Record<string, any>, id?: string, position?: ModalPosition) => {
    const next: ModalEntry = { type, props: props || {}, id, position };
    const stack = modals$.get();
    modals$.set([...stack, next]);
    syncTopToLegacy();
  },

  // Update props of the top modal (or by id if provided via props.id)
  update: (props: Record<string, any>) => {
    const stack = modals$.get();
    if (stack.length === 0) return;

    const targetId = props?.id ?? stack[stack.length - 1].id;
    const updated = stack.map((m, idx) => {
      if (targetId ? m.id === targetId : idx === stack.length - 1) {
        return { ...m, props: { ...(m.props || {}), ...(props || {}) } };
      }
      return m;
    });
    modals$.set(updated);
    syncTopToLegacy();
  },

  // Close the top modal
  close: () => {
    const stack = modals$.get();
    if (stack.length === 0) return;

    const top = stack[stack.length - 1];
    const currentProps = top.props || {};
    if (currentProps.onClose && typeof currentProps.onClose === 'function') {
      try {
        currentProps.onClose();
      } catch (error) {
        console.warn('Error in modal onClose callback:', error);
      }
    }

    modals$.set(stack.slice(0, -1));
    syncTopToLegacy();
  },

  // Close a modal by id
  closeById: (id: string) => {
    const stack = modals$.get();
    const idx = stack.findIndex(m => m.id === id);
    if (idx === -1) return;
    const entry = stack[idx];
    const currentProps = entry.props || {};
    if (currentProps.onClose && typeof currentProps.onClose === 'function') {
      try {
        currentProps.onClose();
      } catch (error) {
        console.warn('Error in modal onClose callback:', error);
      }
    }
    const next = [...stack.slice(0, idx), ...stack.slice(idx + 1)];
    modals$.set(next);
    syncTopToLegacy();
  },

  confirm: (props: Omit<ConfirmModalProps, 'onClose'>, position?: ModalPosition, id?: string) => {
    modalActions.open('confirm', props as Record<string, any>, id, position);
  },

  alert: (message: string, title?: string, position?: ModalPosition, id?: string) => {
    modalActions.open('alert', { message, title }, id, position);
  },

  dropdownPicker: <T = any>(props: Omit<DropdownPickerModalProps<T>, 'onClose'>, position?: ModalPosition, id?: string) => {
    if (!props.items || !Array.isArray(props.items)) {
      console.warn('dropdownPicker: items prop is required and must be an array');
      return;
    }
    if (!props.onSelect || typeof props.onSelect !== 'function') {
      console.warn('dropdownPicker: onSelect prop is required and must be a function');
      return;
    }
    modalActions.open('dropdown-picker', props as Record<string, any>, id, position);
  },

  controllers: (props: Omit<ControllersModalProps, 'onClose'>, position?: ModalPosition, id?: string) => {
    if (!props.controllers || !Array.isArray(props.controllers) || props.controllers.length === 0) {
      console.warn('controllers: controllers prop is required and must be a non-empty array');
      return;
    }
    modalActions.open('controllers', props as Record<string, any>, id, position);
  },

  loading: (props?: Omit<LoadingModalProps, 'onClose'>, position?: ModalPosition, id?: string) => {
    modalActions.open('loading', { closeOnBackgroundTap: false, ...(props || {}) }, id, position);
  },

  openAtPosition: (type: ModalType, props: Record<string, any>, position: ModalPosition, id?: string) => {
    modalActions.open(type, props, id, position);
  },
};