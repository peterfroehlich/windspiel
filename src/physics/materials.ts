// Material datasets: density [kg/m³], Young's modulus E [Pa], internal damping (Q factor proxy)
export interface MaterialProps {
  id: string
  label: string
  density: number        // kg/m^3
  youngsModulus: number  // Pa
  dampingQ: number       // quality factor; higher = longer sustain
  color: string
  metalness: number
  roughness: number
  opacity?: number       // <1 renders translucent (glass)
}

export const MATERIALS: Record<string, MaterialProps> = {
  aluminum:  { id: 'aluminum',  label: 'Aluminum',       density: 2700,  youngsModulus: 69e9,  dampingQ: 3000, color: '#cfd4da', metalness: 0.95, roughness: 0.28 },
  brass:     { id: 'brass',     label: 'Brass',          density: 8500,  youngsModulus: 100e9, dampingQ: 2000, color: '#d4af5a', metalness: 0.95, roughness: 0.25 },
  bronze:    { id: 'bronze',    label: 'Bronze',         density: 8800,  youngsModulus: 110e9, dampingQ: 2500, color: '#b08d57', metalness: 0.9,  roughness: 0.35 },
  copper:    { id: 'copper',    label: 'Copper',         density: 8960,  youngsModulus: 117e9, dampingQ: 1800, color: '#b87333', metalness: 0.9,  roughness: 0.3  },
  stainless: { id: 'stainless', label: 'Stainless Steel',density: 8000,  youngsModulus: 193e9, dampingQ: 3500, color: '#b9bec6', metalness: 1.0,  roughness: 0.2  },
  bamboo:    { id: 'bamboo',    label: 'Bamboo',         density: 700,   youngsModulus: 18e9,  dampingQ: 120,  color: '#c2b280', metalness: 0.0,  roughness: 0.8  },
  glass:     { id: 'glass',     label: 'Glass',          density: 2500,  youngsModulus: 70e9,  dampingQ: 1500, color: '#dceef5', metalness: 0.1,  roughness: 0.05, opacity: 0.45 },
  carbon:    { id: 'carbon',    label: 'Carbon Fibre',   density: 1600,  youngsModulus: 135e9, dampingQ: 2500, color: '#22262c', metalness: 0.6,  roughness: 0.35 },
}

export const STRIKER_MATERIALS: Record<string, {
  id: string; label: string; density: number; hardness: number; // 0 = soft, 1 = hard
  color: string; roughness: number
}> = {
  softWood: { id: 'softWood', label: 'Softwood',  density: 500,  hardness: 0.45, color: '#a0784a', roughness: 0.85 },
  hardWood: { id: 'hardWood', label: 'Hardwood',  density: 750,  hardness: 0.7,  color: '#7a5230', roughness: 0.75 },
  acrylic:  { id: 'acrylic',  label: 'Acrylic',   density: 1180, hardness: 0.85, color: '#e8f4f8', roughness: 0.1  },
  rubber:   { id: 'rubber',   label: 'Rubber',    density: 1100, hardness: 0.15, color: '#2a2a2e', roughness: 0.9  },
  metal:    { id: 'metal',    label: 'Metal',     density: 7800, hardness: 1.0,  color: '#9aa0a8', roughness: 0.3  },
}
