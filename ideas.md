# Brainstorming de Diseño - Sistema de Facturación

<response>
<idea>
## Idea 1: "Corporate Precision" - Estética Neo-Corporativa Minimalista

**Design Movement**: Swiss/International Typographic Style con toques modernos de diseño corporativo japonés.

**Core Principles**:
1. Claridad absoluta en la jerarquía de información
2. Precisión tipográfica como elemento decorativo principal
3. Espacios negativos amplios que transmiten profesionalismo
4. Monocromía con acentos puntuales de color

**Color Philosophy**: Base en tonos neutros cálidos (off-white, charcoal) con un acento en azul petróleo (#1B4965) que transmite confianza y seriedad financiera. El gris cálido (#F5F3F0) como fondo evita la frialdad del blanco puro.

**Layout Paradigm**: Layout de panel único con sidebar colapsable. Formulario y vista previa de factura en split-view horizontal, permitiendo ver cambios en tiempo real.

**Signature Elements**:
1. Líneas divisorias ultra-finas con peso visual calculado
2. Números de factura con tipografía monoespaciada destacada
3. Transiciones suaves de panel con efecto de deslizamiento lateral

**Interaction Philosophy**: Interacciones mínimas pero precisas. Cada clic produce un resultado visible inmediato. Autocompletado fluido con dropdown elegante.

**Animation**: Transiciones de 200ms ease-out para cambios de estado. Fade-in sutil para resultados de búsqueda. Sin animaciones decorativas innecesarias.

**Typography System**: DM Sans para encabezados (peso 600-700), Inter para cuerpo de texto, JetBrains Mono para números y datos financieros.
</idea>
<probability>0.08</probability>
</response>

<response>
<idea>
## Idea 2: "Warm Ledger" - Estética de Libro Contable Moderno

**Design Movement**: Diseño editorial inspirado en libros de contabilidad vintage, reinterpretado con tecnología moderna.

**Core Principles**:
1. Calidez visual que humaniza el proceso de facturación
2. Estructura tabular como homenaje a los libros contables
3. Textura sutil que evoca papel de calidad
4. Funcionalidad sobre decoración

**Color Philosophy**: Palette cálida con fondo crema (#FDFBF7), texto en marrón oscuro (#2C2418), acentos en terracota (#C4704B) para acciones principales y verde oliva (#5C7A3B) para confirmaciones. Evoca la sensación de un escritorio de madera con documentos.

**Layout Paradigm**: Layout vertical centrado tipo "documento", donde el formulario fluye naturalmente hacia la vista previa de factura como si fuera un scroll de documento continuo. Sidebar izquierda fija para navegación entre personas y facturas.

**Signature Elements**:
1. Bordes con estilo de regla contable (líneas horizontales sutiles)
2. Sellos visuales para estados de factura
3. Iconografía de línea fina estilo pluma fuente

**Interaction Philosophy**: Flujo natural de arriba hacia abajo. La búsqueda de personas se siente como hojear un directorio. Los formularios se completan progresivamente revelando secciones.

**Animation**: Revelación progresiva de secciones con slide-down. Efecto de "sello" al generar factura. Micro-animaciones en inputs al recibir foco.

**Typography System**: Playfair Display para títulos principales, Source Sans 3 para cuerpo, IBM Plex Mono para cifras monetarias.
</idea>
<probability>0.06</probability>
</response>

<response>
<idea>
## Idea 3: "Slate Dashboard" - Estética de Panel de Control Profesional

**Design Movement**: Diseño de dashboard empresarial con influencia de fintech moderna (Stripe, Mercury).

**Core Principles**:
1. Eficiencia operativa como prioridad de diseño
2. Densidad informativa controlada
3. Jerarquía visual mediante escala y peso
4. Feedback visual inmediato en cada acción

**Color Philosophy**: Fondo slate claro (#F8FAFC) con cards blancos elevados. Acento principal en índigo profundo (#4338CA) para CTAs y estados activos. Gris azulado (#64748B) para texto secundario. Verde (#059669) para confirmaciones y éxito.

**Layout Paradigm**: Dashboard con header fijo y área de trabajo dividida en cards funcionales. Panel izquierdo para búsqueda/selección de persona, panel derecho para formulario de factura. Modal overlay para vista previa de impresión.

**Signature Elements**:
1. Cards con sombra sutil y bordes redondeados suaves
2. Badges de estado con colores semánticos
3. Search bar prominente con resultados en dropdown flotante

**Interaction Philosophy**: Todo accesible en máximo 2 clics. Búsqueda instantánea con debounce. Formulario inteligente que se adapta según si la persona existe o no.

**Animation**: Hover states con elevación de sombra. Skeleton loading para datos de Supabase. Toast notifications para feedback. Transiciones de 150ms para respuesta inmediata.

**Typography System**: Geist Sans para todo el UI (pesos 400-700), Geist Mono para números de factura y montos. Tamaños bien definidos: 14px base, 20px subtítulos, 28px títulos.
</idea>
<probability>0.07</probability>
</response>

---

## Decisión: Idea 1 - "Corporate Precision"

Elijo la Idea 1 porque:
- Se alinea perfectamente con el propósito de facturación profesional
- El split-view permite editar y previsualizar simultáneamente
- La estética minimalista y precisa transmite confianza
- La paleta neutra con acento azul petróleo es ideal para documentos financieros
- La tipografía monoespaciada para números refuerza la precisión contable
