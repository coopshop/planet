import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { CouchService } from '../../shared/couchdb.service';
import { CustomValidators } from '../../validators/custom-validators';
import { ValidatorService } from '../../validators/validator.service';
import * as constants from '../constants';
import { PlanetMessageService } from '../../shared/planet-message.service';
import { CoursesService } from '../courses.service';
import { UserService } from '../../shared/user.service';
import { uniqueId } from '../../shared/utils';
import { ConfigurationService } from '../../configuration/configuration.service';
import { StateService } from '../../shared/state.service';
import { PlanetStepListService } from '../../shared/forms/planet-step-list.component';

@Component({
  templateUrl: 'courses-add.component.html',
  styleUrls: [ './courses-add.scss' ]
})
export class CoursesAddComponent implements OnInit, OnDestroy {
  // needs member document to implement
  members = [];
  readonly dbName = 'courses'; // make database name a constant
  courseForm: FormGroup;
  documentInfo = { '_rev': undefined, '_id': undefined };
  pageType = 'Add new';
  private onDestroy$ = new Subject<void>();
  private _steps = [];
  get steps() {
    return this._steps;
  }
  set steps(value: any[]) {
    this._steps = value;
    this.coursesService.course = { form: this.courseForm.value, steps: this._steps };
  }

  // from the constants import
  gradeLevels = constants.gradeLevels;
  subjectLevels = constants.subjectLevels;

  mockStep = { stepTitle: 'Add title', description: '!!!' };

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private couchService: CouchService,
    private validatorService: ValidatorService,
    private planetMessageService: PlanetMessageService,
    private coursesService: CoursesService,
    private userService: UserService,
    private stateService: StateService,
    private planetStepListService: PlanetStepListService
  ) {
    this.createForm();
    this.onFormChanges();
  }

  createForm() {
    const configuration = this.stateService.configuration;
    this.courseForm = this.fb.group({
      courseTitle: [
        '',
        CustomValidators.required,
        this.courseTitleValidator(this.route.snapshot.paramMap.get('id') || this.coursesService.course._id)
      ],
      description: [ '', CustomValidators.required ],
      languageOfInstruction: '',
      memberLimit: [
        0, // need to compose validators if we use more than one
        Validators.compose([
          CustomValidators.integerValidator,
          CustomValidators.positiveNumberValidator
        ])
      ],
      method: '',
      gradeLevel: this.gradeLevels[0],
      subjectLevel: this.subjectLevels[0],
      createdDate: this.couchService.datePlaceholder,
      creator: this.userService.get().name + '@' + configuration.code,
      sourcePlanet: configuration.code,
      resideOn: configuration.code,
      updatedDate: this.couchService.datePlaceholder
    });
  }

  courseTitleValidator(id: string = '') {
    return ac => this.validatorService.isUnique$(this.dbName, 'courseTitle', ac, { selectors: { '_id': { '$ne': id } } });
  }

  ngOnInit() {
    if (this.route.snapshot.url[0].path === 'update') {
      this.couchService.get('courses/' + this.route.snapshot.paramMap.get('id'))
      .subscribe((data) => {
        data.steps.forEach(step => {
          step['id'] = uniqueId();
        });
        this.pageType = 'Update';
        this.documentInfo = { _rev: data._rev, _id: data._id };
        if (this.route.snapshot.params.continue !== 'true') {
          this.setFormAndSteps({ form: data, steps: data.steps });
        }
      }, (error) => {
        console.log(error);
      });
    }
    if (this.route.snapshot.params.continue === 'true') {
      this.documentInfo = { '_rev': this.coursesService.course._rev, '_id': this.coursesService.course._id };
      this.setFormAndSteps(this.coursesService.course);
      this.submitAddedExam();
    }
    const returnRoute = this.router.createUrlTree([ '.', { continue: true } ], { relativeTo: this.route });
    this.coursesService.returnUrl = this.router.serializeUrl(returnRoute);
    this.coursesService.course = { form: this.courseForm.value, steps: this.steps };
    this.coursesService.stepIndex = undefined;
  }

  ngOnDestroy() {
    if (this.coursesService.stepIndex === undefined) {
      this.coursesService.reset();
    }
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }

  submitAddedExam() {
    setTimeout(() => {
      if (!this.courseForm.pending) {
        this.onSubmit(false);
      } else {
        this.submitAddedExam();
      }
    }, 1000);
  }

  setFormAndSteps(course: any) {
    this.courseForm.patchValue(course.form);
    this.steps = course.steps || [];
  }

  onFormChanges() {
    this.courseForm.valueChanges.pipe(takeUntil(this.onDestroy$)).subscribe(value => {
      this.coursesService.course = { form: value, steps: this.steps };
    });
  }

  updateCourse(courseInfo, shouldNavigate) {
    this.deleteStepIdProperty();
    this.couchService.updateDocument(
      this.dbName,
      { ...courseInfo, steps: this.steps, updatedDate: this.couchService.datePlaceholder, ...this.documentInfo }
    ).subscribe((res) => {
      const message = courseInfo.courseTitle + (this.pageType === 'Update' ? ' Updated Successfully' : ' Added');
      this.courseChangeComplete(message, res, shouldNavigate);
    }, (err) => {
      // Connect to an error display component to show user that an error has occurred
      console.log(err);
    });
  }

  onSubmit(shouldNavigate = true) {
    if (this.courseForm.valid) {
      this.updateCourse(this.courseForm.value, shouldNavigate);
    } else {
      Object.keys(this.courseForm.controls).forEach(field => {
        const control = this.courseForm.get(field);
        control.markAsTouched({ onlySelf: true });
      });
    }
  }

  courseChangeComplete(message, response: any, shouldNavigate) {
    if (shouldNavigate) {
      this.navigateBack();
    }
    this.courseForm.get('courseTitle').setAsyncValidators(this.courseTitleValidator(response.id));
    this.documentInfo = { '_id': response.id, '_rev': response.rev };
    this.coursesService.course = { ...this.documentInfo };
    this.planetMessageService.showMessage(message);
  }

  deleteStepIdProperty() {
    this.steps.forEach(step => {
      delete step.id;
    });
  }

  addStep() {
    this.steps.push({
      id: uniqueId(),
      stepTitle: '',
      description: '',
      resources: []
    });
    this.planetStepListService.addStep(this.steps.length - 1);
  }

  navigateBack() {
    this.router.navigate([ '/courses' ]);
  }

  removeStep(pos) {
    this.steps.splice(pos, 1);
  }

  orderStep(oldPos, newPos) {
    const tempStep = this.steps[oldPos];
    this.steps.splice(oldPos, 1);
    this.steps.splice(newPos, 0, tempStep);
  }

  stepTrackByFn(index, item) {
    return item.id;
  }

}
