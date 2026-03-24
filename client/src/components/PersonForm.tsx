/**
 * PersonForm Component
 * ====================
 * Design: Corporate Precision - Clean form with structured sections
 * For registering new persons with personal and banking data
 */

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { crearPersona, type Persona } from '@/lib/supabase';
import { UserPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface PersonFormProps {
  onPersonCreated: (persona: Persona) => void;
  onCancel?: () => void;
}

export default function PersonForm({ onPersonCreated, onCancel }: PersonFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nombre_completo: '',
    cedula: '',
    dv: '',
    cuenta_bancaria: '',
    nombre_banco: '',
    tipo_cuenta: '' as 'Ahorros' | 'Corriente' | '',
    titular_cuenta: '',
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nombre_completo || !formData.cedula || !formData.dv ||
        !formData.cuenta_bancaria || !formData.nombre_banco || !formData.tipo_cuenta ||
        !formData.titular_cuenta) {
      toast.error('Por favor complete todos los campos');
      return;
    }

    setIsSubmitting(true);
    try {
      const persona = await crearPersona({
        nombre_completo: formData.nombre_completo.toUpperCase(),
        cedula: formData.cedula,
        dv: formData.dv,
        cuenta_bancaria: formData.cuenta_bancaria,
        nombre_banco: formData.nombre_banco,
        tipo_cuenta: formData.tipo_cuenta as 'Ahorros' | 'Corriente',
        titular_cuenta: formData.titular_cuenta,
      });
      toast.success('Persona registrada exitosamente');
      onPersonCreated(persona);
    } catch (err: any) {
      if (err?.message?.includes('duplicate') || err?.code === '23505') {
        toast.error('Ya existe una persona con esa cédula');
      } else {
        toast.error('Error al registrar persona: ' + (err?.message || 'Error desconocido'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
        <UserPlus className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Registrar Nueva Persona</h3>
      </div>

      {/* Personal Data */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Datos Personales
        </p>
        <div>
          <Label htmlFor="nombre_completo" className="text-xs mb-1.5">
            Nombre Completo
          </Label>
          <Input
            id="nombre_completo"
            value={formData.nombre_completo}
            onChange={(e) => handleChange('nombre_completo', e.target.value)}
            placeholder="Ej: JEAN LOUIS ROLDAN"
            className="h-10 text-sm bg-white uppercase"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cedula" className="text-xs mb-1.5">
              Cédula / Documento
            </Label>
            <Input
              id="cedula"
              value={formData.cedula}
              onChange={(e) => handleChange('cedula', e.target.value)}
              placeholder="Ej: 8-981-602"
              className="h-10 text-sm bg-white font-mono-numbers"
            />
          </div>
          <div>
            <Label htmlFor="dv" className="text-xs mb-1.5">
              DV (Dígito Verificador)
            </Label>
            <Input
              id="dv"
              value={formData.dv}
              onChange={(e) => handleChange('dv', e.target.value)}
              placeholder="Ej: 60"
              className="h-10 text-sm bg-white font-mono-numbers"
              maxLength={4}
            />
          </div>
        </div>
      </div>

      {/* Banking Data */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Datos Bancarios
        </p>
        <div>
          <Label htmlFor="nombre_banco" className="text-xs mb-1.5">
            Nombre del Banco
          </Label>
          <Input
            id="nombre_banco"
            value={formData.nombre_banco}
            onChange={(e) => handleChange('nombre_banco', e.target.value)}
            placeholder="Ej: Banco General"
            className="h-10 text-sm bg-white"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="tipo_cuenta" className="text-xs mb-1.5">
              Tipo de Cuenta
            </Label>
            <Select
              value={formData.tipo_cuenta}
              onValueChange={(val) => handleChange('tipo_cuenta', val)}
            >
              <SelectTrigger className="h-10 text-sm bg-white">
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Ahorros">Ahorros</SelectItem>
                <SelectItem value="Corriente">Corriente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="cuenta_bancaria" className="text-xs mb-1.5">
              Número de Cuenta
            </Label>
            <Input
              id="cuenta_bancaria"
              value={formData.cuenta_bancaria}
              onChange={(e) => handleChange('cuenta_bancaria', e.target.value)}
              placeholder="Ej: 04-79-98-183451-8"
              className="h-10 text-sm bg-white font-mono-numbers"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="titular_cuenta" className="text-xs mb-1.5">
            Titular de la Cuenta
          </Label>
          <Input
            id="titular_cuenta"
            value={formData.titular_cuenta}
            onChange={(e) => handleChange('titular_cuenta', e.target.value)}
            placeholder="Nombre del titular de la cuenta bancaria"
            className="h-10 text-sm bg-white"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 h-10 text-sm font-medium"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4 mr-2" />
              Guardar Persona
            </>
          )}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="h-10 text-sm">
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
