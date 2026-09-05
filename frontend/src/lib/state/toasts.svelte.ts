export interface Toast {
  id: string;
  message: string;
  variant: 'info' | 'error' | 'success';
}

class ToastStore {
  toasts = $state<Toast[]>([]);

  show(message: string, variant: 'info' | 'error' | 'success' = 'info', duration = 3500) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.toasts = [...this.toasts, { id, message, variant }];
    if (duration > 0) {
      setTimeout(() => {
        this.remove(id);
      }, duration);
    }
  }

  error(message: string, duration = 4500) {
    this.show(message, 'error', duration);
  }

  success(message: string, duration = 3000) {
    this.show(message, 'success', duration);
  }

  remove(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }
}

export const toasts = new ToastStore();
