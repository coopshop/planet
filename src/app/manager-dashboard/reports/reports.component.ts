import { Component } from '@angular/core';
import { forkJoin } from 'rxjs';
import { CouchService } from '../../shared/couchdb.service';
import { findDocuments } from '../../shared/mangoQueries';
import { ReportsService } from './reports.service';
import { PlanetMessageService } from '../../shared/planet-message.service';
import { StateService } from '../../shared/state.service';
import { ManagerService } from '../manager.service';

@Component({
  templateUrl: './reports.component.html',
})
export class ReportsComponent {

  hubs = [];
  sandboxPlanets = [];

  constructor(
    private couchService: CouchService,
    private activityService: ReportsService,
    private planetMessageService: PlanetMessageService,
    private stateService: StateService,
    private managerService: ManagerService
  ) {
    this.getLogs();
  }
  countByPlanet(planet, logs) {
    return logs.reduce((total, log: any) => {
      if (log.createdOn === planet.code) {
        return total + log.count;
      }
      return total;
    }, 0);
  }

  getLogs() {
    forkJoin([
      this.couchService.findAll('communityregistrationrequests',
        findDocuments(
          { 'parentCode': this.stateService.configuration.code, 'registrationRequest': 'accepted' }, 0, [ { 'createdDate': 'desc' } ]
        )
      ),
      this.activityService.getResourceVisits(),
      this.activityService.getLoginActivities(),
      this.activityService.getAdminActivities(),
      this.couchService.findAll('hubs')
    ]).subscribe(([ planets, resourceVisits, loginActivities, adminActivities, hubs ]) => {
      this.arrangePlanetData(planets.map((planet: any) => ({
        ...planet,
        resourceViews: this.countByPlanet(planet, resourceVisits.byResource),
        userVisits: this.countByPlanet(planet, loginActivities.byUser),
        ...this.activityService.mostRecentAdminActivities(planet, loginActivities.byUser, adminActivities)
      })), hubs);
    }, (error) => this.planetMessageService.showAlert('There was a problem getting Activity Logs'));
  }

  arrangePlanetData(planets, hubData) {
    const { hubs, sandboxPlanets } = this.managerService.arrangePlanetsIntoHubs(planets, hubData);
    this.hubs = hubs;
    this.sandboxPlanets = sandboxPlanets;
  }

}
