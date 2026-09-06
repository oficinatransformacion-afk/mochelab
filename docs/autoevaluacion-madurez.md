# Autoevaluación y calibración de madurez por rol

## Flujo

```text
Dimensión
  → Comportamientos observables aplicables al rol
    → Autoevaluación por período
      → Puntaje calculado
        → Calibración manual del administrador
          → Puntaje final y nivel de madurez
```

## Configuración

Una dimensión agrupa comportamientos observables relacionados. Cada
comportamiento contiene el enunciado que verá la persona, una ayuda opcional,
peso, orden y estado.

Al iniciar una autoevaluación se registra una versión de configuración. Cada
respuesta conserva una copia del enunciado, dimensión y pesos usados. Los
cambios administrativos posteriores solo se aplican a períodos nuevos y no
modifican formularios iniciados ni resultados históricos.

La relación `ObservableBehaviorRole` determina qué comportamientos debe
responder cada rol laboral. Un comportamiento puede aplicar a varios roles.

## Escala de respuesta

La escala usa valores de 0 a 2:

- `0`: no demostrado.
- `1`: demostrado ocasionalmente o con acompañamiento.
- `2`: demostrado regularmente de forma autónoma.

El formulario permite un comentario opcional por comportamiento. Una
autoevaluación solo puede enviarse cuando todos los comportamientos activos y
aplicables al rol tengan respuesta.

## Cálculo

El puntaje de cada dimensión es el promedio ponderado de sus comportamientos.
El puntaje total es el promedio ponderado de las dimensiones respondidas. Los
pesos tienen valor inicial 1.

Los niveles usan las reglas confirmadas:

- Menor que 0.5: Postulante.
- Desde 0.5 y menor que 1.5: Principiante.
- Desde 1.5 y hasta 2: Oficial.

El puntaje nunca supera 2. El nivel Maestro no se obtiene por puntaje. Requiere
que la persona haya formado a otra persona, haya facilitado un campamento y que
su equipo se encuentre en nivel Oficial durante el período evaluado.

Al enviar el formulario, el sistema guarda las respuestas, el puntaje calculado
y una versión consolidada en `RoleMaturity`.

## Calibración

Solo el perfil `ADMINISTRADOR`, con permiso de edición sobre Madurez, puede
registrar la calibración. La operación conserva:

- puntaje original de la autoevaluación;
- puntaje calibrado;
- puntaje final utilizado para el nivel;
- administrador que calibró;
- fecha y comentario obligatorio de calibración.

La calibración no modifica las respuestas originales. Cada cambio debe quedar
registrado en auditoría con el valor anterior y el nuevo.

## Datos históricos

Los registros importados de `MadurezRol` se marcan como históricos. Mantienen su
puntaje final y período, pero no requieren una autoevaluación ni respuestas
retroactivas.
