import{Controller,Get}from"@nestjs/common";import{AdminOnly,RequirePermission}from"../access/access.decorators";import{DataQualityRepository}from"./data-quality.repository";
@AdminOnly()@RequirePermission("INICIO","view")@Controller("data-quality")export class DataQualityController{constructor(private readonly repository:DataQualityRepository){}@Get()list(){return this.repository.list()}}
