/**
 * TarifasConfig — Modal/dialog to view and update department rates
 * Reads from tarifas_departamento table, allows editing inline.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Settings, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  TarifaDepartamento,
  obtenerTarifas,
  actualizarTarifa,
} from '@/lib/supabase';

interface Props {
  onTarifasUpdated?: () => void;
}

export default function TarifasConfig({ onTarifasUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [tarifas, setTarifas] = useState<TarifaDepartamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedTarifas, setEditedTarifas] = useState<
    Record<string, { tarifa_diaria: number; tarifa_hora_extra: number }>
  >({});

  useEffect(() => {
    if (open) loadTarifas();
  }, [open]);

  async function loadTarifas() {
    setLoading(true);
    try {
      const data = await obtenerTarifas();
      setTarifas(data);
      const edits: Record<string, { tarifa_diaria: number; tarifa_hora_extra: number }> = {};
      data.forEach((t) => {
        edits[t.clave] = {
          tarifa_diaria: t.tarifa_diaria,
          tarifa_hora_extra: t.tarifa_hora_extra,
        };
      });
      setEditedTarifas(edits);
    } catch {
      toast.error('Error al cargar tarifas');
    } finally {
      setLoading(false);
    }
  }

  function handleChange(clave: string, field: 'tarifa_diaria' | 'tarifa_hora_extra', value: string) {
    setEditedTarifas((prev) => ({
      ...prev,
      [clave]: {
        ...prev[clave],
        [field]: parseFloat(value) || 0,
      },
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      for (const [clave, vals] of Object.entries(editedTarifas)) {
        await actualizarTarifa(clave, vals.tarifa_diaria, vals.tarifa_hora_extra);
      }
      toast.success('Tarifas actualizadas correctamente');
      onTarifasUpdated?.();
      setOpen(false);
    } catch {
      toast.error('Error al guardar tarifas');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="w-4 h-4" />
          Tarifas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold" style={{ color: '#1B4965' }}>
            Configurar Tarifas por Departamento
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#1B4965' }} />
          </div>
        ) : (
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-[1fr_100px_100px] gap-3 px-1 pb-2 border-b text-xs font-semibold uppercase tracking-wide" style={{ color: '#6b7280' }}>
              <span>Departamento</span>
              <span className="text-center">$/Día</span>
              <span className="text-center">$/Hora Extra</span>
            </div>

            {tarifas.map((t) => (
              <div
                key={t.clave}
                className="grid grid-cols-[1fr_100px_100px] gap-3 items-center py-2 px-1 rounded hover:bg-gray-50"
              >
                <span className="font-medium text-sm">{t.nombre}</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editedTarifas[t.clave]?.tarifa_diaria ?? ''}
                  onChange={(e) => handleChange(t.clave, 'tarifa_diaria', e.target.value)}
                  className="h-8 text-center text-sm"
                />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editedTarifas[t.clave]?.tarifa_hora_extra ?? ''}
                  onChange={(e) => handleChange(t.clave, 'tarifa_hora_extra', e.target.value)}
                  className="h-8 text-center text-sm"
                />
              </div>
            ))}

            <div className="pt-4 flex justify-end">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="gap-2"
                style={{ backgroundColor: '#1B4965' }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar Tarifas
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
