# Control de acceso por perfil y módulo

Mochelab usa un control de acceso sencillo y configurable:

```text
Usuario → Perfil → Módulo → Ver / Crear / Editar / Eliminar
```

## Perfiles iniciales

- `ADMINISTRADOR`: acceso operativo completo, configuración, usuarios y migraciones.
- `USUARIO`: consulta general y mantenimiento limitado de madurez, objetivos y portafolio.

Los perfiles se mantienen en el catálogo `PERFIL_USUARIO`. Cada usuario conserva
un solo perfil mediante `User.profileId`.

## Entidades

`SystemModule` representa una sección navegable de la aplicación. Guarda código,
nombre, ruta, icono, orden y estado.

`ProfileModule` relaciona un perfil con un módulo y guarda `canView`,
`canCreate`, `canEdit` y `canDelete`. La combinación de perfil y módulo es única.

## Aplicación de la regla

Al iniciar sesión, la API entrega al frontend los módulos activos autorizados
para el perfil. La web usa `canView` para construir el menú y los demás valores
para habilitar acciones.

La API comprueba nuevamente el acceso en cada operación. Si `canView` es falso,
las demás operaciones se consideran denegadas. Todo acceso no configurado se
deniega.

## Configuración inicial

- `database/seeds/modulo_sistema.csv` contiene los módulos.
- `database/seeds/perfil_modulo_inicial.csv` contiene la matriz inicial.

El administrador podrá modificar esta matriz desde Configuración > Usuarios y
accesos. Cada cambio deberá generar un registro de auditoría.
